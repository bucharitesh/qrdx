// The workspaces backfill (packages/database/scripts/backfill-workspaces.mjs)
// run end to end against a fake Postgres client that executes the script's
// own SQL on tables held in memory, with transactions that really roll back.
// Nothing connects to a database. Also keeps the script's copy of the rules
// (ids, slugs, names, reserved words, tables) equal to the app's.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ownWorkspaceId as appOwnWorkspaceId,
  ownWorkspaceMemberId as appOwnWorkspaceMemberId,
} from "@repo/auth/own-workspace-id";
import {
  RESERVED_WORKSPACE_SLUGS as APP_RESERVED,
  nextFreeSlug as appNextFreeSlug,
  ownWorkspaceName as appOwnWorkspaceName,
  ownWorkspaceSlugBase as appOwnWorkspaceSlugBase,
} from "@repo/auth/workspace-rules";
import { beforeEach, describe, expect, it } from "vitest";
import * as backfill from "../../../../packages/database/scripts/backfill-workspaces.mjs";

type Row = Record<string, unknown>;
const ADOPTED = backfill.ADOPTED_TABLES as { table: string; owner: string }[];
const TABLES = [
  "user",
  "organization",
  "member",
  "community_theme",
  ...ADOPTED.map((t) => t.table),
];

/** Executes exactly the statements in backfill.SQL; anything else throws. */
class FakePg {
  tables: Record<string, Row[]> = Object.fromEntries(
    TABLES.map((t) => [t, []]),
  );
  log: string[] = [];
  private saved: Record<string, Row[]> | null = null;
  /** Rows a concurrent writer "takes" just before the move (verify must catch it). */
  stealOnMove: { table: string; id: string } | null = null;

  seed(table: string, rows: Row[]) {
    this.tables[table]?.push(...rows.map((row) => ({ ...row })));
  }

  rows(table: string) {
    return this.tables[table] ?? [];
  }

  async query(text: string, params: unknown[] = []) {
    this.log.push(text);
    const S = backfill.SQL;
    const result = (rows: Row[], rowCount = rows.length) => ({
      rows,
      rowCount,
    });
    if (text === "BEGIN") {
      this.saved = structuredClone(this.tables);
      return result([]);
    }
    if (text === "COMMIT") {
      this.saved = null;
      return result([]);
    }
    if (text === "ROLLBACK") {
      if (this.saved) this.tables = this.saved;
      this.saved = null;
      return result([]);
    }
    if (text.startsWith("SET LOCAL ") || text === S.advisoryLock) {
      return result([]);
    }
    if (text === S.users) {
      return result(
        this.rows("user").map(({ id, name, email }) => ({ id, name, email })),
      );
    }
    if (text === S.organizations) {
      return result(
        this.rows("organization").map(({ id, slug }) => ({ id, slug })),
      );
    }
    if (text === S.members) return result(this.rows("member"));
    if (text === S.firstPartyApps) {
      const n = this.rows("oauth_app").filter(
        (r) => r.organization_id == null && r.owner_user_id == null,
      ).length;
      return result([{ n }]);
    }
    if (text === S.publishedThemes) return result(this.rows("community_theme"));
    if (text === S.domains) return result(this.rows("custom_domain"));
    if (text === S.pages) return result(this.rows("landing_page"));
    if (text === S.insertOrganization) {
      const [id, name, slug, createdAt] = params;
      if (this.rows("organization").some((r) => r.id === id))
        return result([], 0);
      if (this.rows("organization").some((r) => r.slug === slug)) {
        throw Object.assign(
          new Error("duplicate key (organization_slug_unique)"),
          {
            code: "23505",
          },
        );
      }
      this.rows("organization").push({ id, name, slug, created_at: createdAt });
      return result([], 1);
    }
    if (text === S.insertMember) {
      const [id, organizationId, userId, createdAt] = params;
      if (this.rows("member").some((r) => r.id === id)) return result([], 0);
      this.rows("member").push({
        id,
        organization_id: organizationId,
        user_id: userId,
        role: "owner",
        created_at: createdAt,
      });
      return result([], 1);
    }
    if (text === S.countOrganizations) {
      const ids = params[0] as string[];
      return result([
        {
          n: this.rows("organization").filter((r) =>
            ids.includes(r.id as string),
          ).length,
        },
      ]);
    }
    if (text === S.ownMembers) {
      const ids = params[0] as string[];
      return result(
        this.rows("member").filter((r) =>
          ids.includes(r.organization_id as string),
        ),
      );
    }
    for (const spec of ADOPTED) {
      const personal = (r: Row) =>
        r.organization_id == null && r[spec.owner] != null;
      if (text === S.personalRows(spec)) {
        return result(
          this.rows(spec.table)
            .filter(personal)
            .sort((a, b) => String(a.id).localeCompare(String(b.id))),
        );
      }
      if (text === S.countPersonal(spec)) {
        return result([{ n: this.rows(spec.table).filter(personal).length }]);
      }
      if (text === S.moveRows(spec)) {
        const [organizationId, ids] = params as [string, string[]];
        if (this.stealOnMove?.table === spec.table) {
          const row = this.rows(spec.table).find(
            (r) => r.id === this.stealOnMove?.id,
          );
          if (row) row.organization_id = "org_somewhere_else";
        }
        let count = 0;
        for (const row of this.rows(spec.table)) {
          if (ids.includes(row.id as string) && row.organization_id == null) {
            row.organization_id = organizationId;
            count++;
          }
        }
        return result([], count);
      }
    }
    throw new Error(`FakePg: unexpected SQL: ${text}`);
  }
}

const NOW = new Date("2026-11-03T12:00:00Z");

function liveLikeData(pg: FakePg) {
  pg.seed("user", [
    { id: "u_ritesh", name: "Ritesh Bucha", email: "ritesh@example.com" },
    { id: "u_team", name: "QRdx", email: "team@qrdx.dev" },
    { id: "u_maria", name: "", email: "maria@example.com" },
  ]);
  pg.seed("qr_code", [
    {
      id: "code_1",
      user_id: "u_ritesh",
      organization_id: null,
      slug: "Ab3dE5f",
      slug_scope: "",
      domain_id: null,
    },
    {
      id: "code_2",
      user_id: "u_ritesh",
      organization_id: null,
      slug: "spring-menu",
      slug_scope: "dom_1",
      domain_id: "dom_1",
    },
  ]);
  pg.seed("custom_domain", [
    {
      id: "dom_1",
      user_id: "u_ritesh",
      organization_id: null,
      hostname: "go.example.com",
    },
  ]);
  pg.seed("landing_page", [
    { id: "page_1", user_id: "u_team", organization_id: null },
  ]);
  pg.seed("qr_preset", [
    { id: "theme_1", user_id: "u_team", organization_id: null, name: "Brand" },
    { id: "theme_2", user_id: "u_maria", organization_id: null, name: "Blue" },
  ]);
  pg.seed("community_theme", [{ id: "ct_1", theme_id: "theme_1" }]);
  pg.seed("oauth_app", [
    // A developer's own app, and the first-party app (no owner).
    {
      id: "app_dev",
      owner_user_id: "u_ritesh",
      organization_id: null,
      client_id: "qrdx_dev",
    },
    {
      id: "app_qrdx",
      owner_user_id: null,
      organization_id: null,
      client_id: "qrdx_raycast",
    },
  ]);
}

const run = async (
  pg: FakePg,
  argv: string[],
  saved: Record<string, string> = {},
) => {
  const lines: string[] = [];
  const code = await backfill.run({
    client: pg,
    argv,
    log: (line: string) => lines.push(line),
    save: async (path: string, text: string) => {
      saved[path] = text;
    },
    now: NOW,
  });
  return { code, out: lines.join("\n"), saved };
};

let pg: FakePg;
beforeEach(() => {
  pg = new FakePg();
  liveLikeData(pg);
});

describe("backfill-workspaces: dry run (the default)", () => {
  it("prints every planned insert and update, then rolls back", async () => {
    const before = structuredClone(pg.tables);
    const { code, out } = await run(pg, []);
    expect(code).toBe(0);
    expect(out).toContain("Mode: dry run (nothing is written)");
    for (const user of ["u_ritesh", "u_team", "u_maria"]) {
      expect(out).toContain(
        `INSERT organization id=${backfill.ownWorkspaceId(user)}`,
      );
      expect(out).toContain(
        `INSERT member id=${backfill.ownWorkspaceMemberId(user)}`,
      );
    }
    expect(out).toContain("slug=ritesh-bucha");
    expect(out).toContain("slug=qrdx-workspace");
    expect(out).toContain("slug=maria");
    expect(out).toContain(
      `UPDATE qr_code SET organization_id=${backfill.ownWorkspaceId("u_ritesh")} WHERE id IN (code_1, code_2) [2 row(s)]`,
    );
    expect(out).toContain("UPDATE oauth_app");
    expect(out).toContain("community gallery");
    expect(out).toContain(
      "1 first-party OAuth app(s) (no owner) stay without a workspace",
    );
    expect(out).toContain("Run with --apply --backup <file> to write.");
    expect(pg.log.at(-1)).toBe("ROLLBACK");
    expect(pg.tables).toEqual(before);
    expect(pg.log).not.toContain(backfill.SQL.insertOrganization);
  });

  it("sets lock and statement timeouts and takes a lock against a second run", async () => {
    await run(pg, ["--lock-timeout", "3s", "--statement-timeout", "2min"]);
    expect(pg.log.slice(0, 4)).toEqual([
      "BEGIN",
      "SET LOCAL lock_timeout = '3s'",
      "SET LOCAL statement_timeout = '2min'",
      backfill.SQL.advisoryLock,
    ]);
  });

  it("refuses --apply without a backup file, and odd options", async () => {
    await expect(run(pg, ["--apply"])).rejects.toThrow(/--backup/);
    await expect(run(pg, ["--lock-timeout", "5 seconds"])).rejects.toThrow(
      /Timeouts/,
    );
    await expect(run(pg, ["--force"])).rejects.toThrow(/Unknown option/);
    expect(pg.log).toEqual([]);
  });
});

describe("backfill-workspaces: --apply", () => {
  it("backs up the rows first, then gives everyone their own workspace and moves their rows", async () => {
    const { code, out, saved } = await run(pg, [
      "--apply",
      "--backup",
      "b.json",
    ]);
    expect(code).toBe(0);
    expect(out).toContain("Committed: 3 workspace(s), 3 membership(s)");
    expect(pg.log.at(-1)).toBe("COMMIT");

    // The backup came before any write, with every changed row as it was.
    const firstWrite = pg.log.indexOf(backfill.SQL.insertOrganization);
    expect(firstWrite).toBeGreaterThan(0);
    const backup = JSON.parse(saved["b.json"] as string);
    expect(backup.updatedRows.qr_code.map((r: Row) => r.id)).toEqual([
      "code_1",
      "code_2",
    ]);
    expect(
      backup.updatedRows.qr_code.every((r: Row) => r.organization_id === null),
    ).toBe(true);
    expect(backup.updatedRows.oauth_app.map((r: Row) => r.id)).toEqual([
      "app_dev",
    ]);
    expect(backup.insertedOrganizations).toHaveLength(3);

    const own = backfill.ownWorkspaceId;
    expect(pg.rows("organization")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: own("u_ritesh"),
          slug: "ritesh-bucha",
          name: "Ritesh's workspace",
        }),
        expect.objectContaining({
          id: own("u_team"),
          slug: "qrdx-workspace",
          name: "QRdx's workspace",
        }),
        expect.objectContaining({
          id: own("u_maria"),
          slug: "maria",
          name: "maria's workspace",
        }),
      ]),
    );
    for (const user of ["u_ritesh", "u_team", "u_maria"]) {
      expect(pg.rows("member")).toContainEqual(
        expect.objectContaining({
          organization_id: own(user),
          user_id: user,
          role: "owner",
        }),
      );
    }
    const orgOf = (table: string, id: string) =>
      pg.rows(table).find((r) => r.id === id)?.organization_id;
    expect(orgOf("qr_code", "code_1")).toBe(own("u_ritesh"));
    expect(orgOf("custom_domain", "dom_1")).toBe(own("u_ritesh"));
    expect(orgOf("landing_page", "page_1")).toBe(own("u_team"));
    expect(orgOf("qr_preset", "theme_1")).toBe(own("u_team"));
    expect(orgOf("qr_preset", "theme_2")).toBe(own("u_maria"));
    expect(orgOf("oauth_app", "app_dev")).toBe(own("u_ritesh"));
    // First-party OAuth apps stay exactly as they were.
    expect(pg.rows("oauth_app").find((r) => r.id === "app_qrdx")).toEqual({
      id: "app_qrdx",
      owner_user_id: null,
      organization_id: null,
      client_id: "qrdx_raycast",
    });
    // Short links resolve as before: slug, slug_scope and domain_id unchanged.
    expect(pg.rows("qr_code").find((r) => r.id === "code_2")).toMatchObject({
      slug: "spring-menu",
      slug_scope: "dom_1",
      domain_id: "dom_1",
    });
    // The gallery's row still points at the same theme.
    expect(pg.rows("community_theme")).toEqual([
      { id: "ct_1", theme_id: "theme_1" },
    ]);
  });

  it("is idempotent: a second run plans nothing and writes nothing", async () => {
    await run(pg, ["--apply", "--backup", "b.json"]);
    const after = structuredClone(pg.tables);
    pg.log = [];
    const second = await run(pg, ["--apply", "--backup", "b2.json"]);
    expect(second.code).toBe(0);
    expect(second.out).toContain("Nothing to do");
    expect(second.saved).toEqual({});
    expect(pg.tables).toEqual(after);
    expect(pg.log.at(-1)).toBe("ROLLBACK");
  });

  it("works with workspaces the app already made, and picks free, unreserved slugs", async () => {
    // The app made Ritesh's own workspace on his first visit (and moved his
    // rows then); a team already holds "maria".
    pg.seed("organization", [
      {
        id: backfill.ownWorkspaceId("u_ritesh"),
        slug: "ritesh-bucha",
        name: "Ritesh's workspace",
      },
      { id: "org_other", slug: "maria", name: "Maria's team" },
    ]);
    pg.seed("member", [
      {
        id: backfill.ownWorkspaceMemberId("u_ritesh"),
        organization_id: backfill.ownWorkspaceId("u_ritesh"),
        user_id: "u_ritesh",
        role: "owner",
      },
    ]);
    for (const row of pg.rows("qr_code"))
      row.organization_id = backfill.ownWorkspaceId("u_ritesh");
    const { code, out } = await run(pg, ["--apply", "--backup", "b.json"]);
    expect(code).toBe(0);
    expect(out).not.toContain(
      `INSERT organization id=${backfill.ownWorkspaceId("u_ritesh")}`,
    );
    expect(out).toContain("slug=maria-2");
    // His rows the app hadn't moved yet still move into it.
    expect(pg.rows("custom_domain")[0]?.organization_id).toBe(
      backfill.ownWorkspaceId("u_ritesh"),
    );
  });

  it("rolls everything back when a count doesn't add up", async () => {
    const before = structuredClone(pg.tables);
    pg.stealOnMove = { table: "qr_preset", id: "theme_2" };
    const { code, out } = await run(pg, ["--apply", "--backup", "b.json"]);
    expect(code).toBe(1);
    expect(out).toContain("check failed: qr_preset: moved 1 row(s), planned 2");
    expect(out).toContain("Rolled back: nothing was changed.");
    expect(pg.tables).toEqual(before);
  });

  it("leaves rows whose creator has no account, and says so", async () => {
    pg.seed("tag", [
      { id: "tag_ghost", user_id: "u_deleted", organization_id: null },
    ]);
    const { code, out } = await run(pg, ["--apply", "--backup", "b.json"]);
    expect(code).toBe(0);
    expect(out).toContain(
      "tag tag_ghost: creator u_deleted has no account; left as it is",
    );
    expect(pg.rows("tag")[0]?.organization_id).toBeNull();
  });
});

describe("backfill-workspaces: the same rules as the app", () => {
  it("derives the same ids", () => {
    for (const id of ["u_1", "abc", "x".repeat(32)]) {
      expect(backfill.ownWorkspaceId(id)).toBe(appOwnWorkspaceId(id));
      expect(backfill.ownWorkspaceMemberId(id)).toBe(
        appOwnWorkspaceMemberId(id),
      );
    }
  });

  it("makes the same slugs and names", () => {
    expect(backfill.RESERVED_WORKSPACE_SLUGS).toEqual(APP_RESERVED);
    for (const person of [
      { name: "Ritesh Bucha", email: "r@x.dev" },
      { name: "QRdx", email: "team@qrdx.dev" },
      { name: "", email: "maria@example.com" },
      { name: "Al", email: "al@x.dev" },
      { name: "Ünïcödé Ñame", email: "u@x.dev" },
      { name: "李", email: "李@x.dev" },
      { name: "a".repeat(80), email: "x@y.z" },
      { name: null, email: "settings@x.dev" },
    ]) {
      expect(backfill.ownWorkspaceSlugBase(person)).toBe(
        appOwnWorkspaceSlugBase(person),
      );
      expect(backfill.ownWorkspaceName(person)).toBe(
        appOwnWorkspaceName(person),
      );
    }
    const taken = new Set(["acme", "acme-2"]);
    expect(backfill.nextFreeSlug("acme", taken)).toBe(
      appNextFreeSlug("acme", taken),
    );
  });

  it("covers every table whose rows can have no workspace", () => {
    // Columns `organization_id` that may be null (member and invitation's
    // are NOT NULL) in packages/database/schema.ts.
    const schema = readFileSync(
      fileURLToPath(
        new URL("../../../../packages/database/schema.ts", import.meta.url),
      ),
      "utf8",
    );
    const nullable = [
      ...schema.matchAll(
        /export const \w+ = pgTable\(\s*"(\w+)"[\s\S]*?\n\);/g,
      ),
    ]
      .filter(([block]) =>
        /organizationId: text\("organization_id"\)\.references/.test(block),
      )
      .map(([, name]) => name)
      // SSO connections are only ever made for a workspace (apps/docs/lib/
      // sso/connections.ts); the column is nullable for the plugin's
      // personal providers, which QRdx doesn't use.
      .filter((name) => name !== "sso_provider")
      .sort();
    expect(ADOPTED.map((t) => t.table).sort()).toEqual(nullable);
  });
});
