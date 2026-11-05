// A fake Postgres client for the community scripts (packages/database/
// scripts/backfill-community.mjs and seed-community.mjs): it runs exactly
// the statements in their SQL objects on tables held in memory, with
// transactions that really roll back and the unique keys of 0012. Any
// other statement throws, so a test can't pass on SQL the fake misread.
import * as backfill from "../../../../packages/database/scripts/backfill-community.mjs";
import * as seed from "../../../../packages/database/scripts/seed-community.mjs";

type Row = Record<string, unknown>;

const TABLES = [
  "user",
  "organization",
  "qr_preset",
  "community_theme",
  "community_theme_tag",
  "theme_like",
  "community_profile",
  "community_item",
  "community_item_version",
  "community_item_tag",
  "community_like",
  "community_collection_entry",
] as const;

/** Unique keys from manual-sql/0012 (the partial person index included). */
const UNIQUE: Record<string, ((row: Row) => string | null)[]> = {
  community_profile: [
    (r) => `id:${r.id}`,
    (r) => (r.handle ? `handle:${r.handle}` : null),
    (r) => (r.kind === "person" && r.user_id ? `person:${r.user_id}` : null),
  ],
  community_item: [
    (r) => `id:${r.id}`,
    (r) => `slug:${r.type}:${r.slug}`,
    (r) =>
      r.legacy_community_theme_id
        ? `legacy:${r.legacy_community_theme_id}`
        : null,
  ],
  community_item_version: [
    (r) => `${r.item_id}:${r.version}`,
    (r) => `id:${r.id}`,
  ],
  community_item_tag: [(r) => `${r.item_id}:${r.tag}`],
  community_like: [(r) => `${r.user_id}:${r.item_id}`],
  community_collection_entry: [(r) => `${r.collection_id}:${r.item_id}`],
};

export class FakeCommunityPg {
  tables: Record<string, Row[]> = Object.fromEntries(
    TABLES.map((t) => [t, []]),
  );
  log: string[] = [];
  /** Throw on this statement (to test rollbacks) */
  failOn: string | null = null;
  /** Drop rows of this table right after insert (verify must catch it) */
  loseInserts: string | null = null;
  private saved: Record<string, Row[]> | null = null;

  seed(table: string, rows: Row[]) {
    this.tables[table]?.push(...rows.map((row) => ({ ...row })));
  }

  rows(table: string): Row[] {
    return this.tables[table] ?? [];
  }

  private insert(table: string, row: Row): number {
    const keys = UNIQUE[table] ?? [];
    const rows = this.rows(table);
    for (const key of keys) {
      const value = key(row);
      if (value && rows.some((other) => key(other) === value)) return 0;
    }
    if (this.loseInserts === table) return 1;
    rows.push(row);
    return 1;
  }

  async query(text: string, params: unknown[] = []) {
    this.log.push(text);
    if (this.failOn && text === this.failOn)
      throw new Error("injected failure");
    const result = (rows: Row[], rowCount = rows.length) => ({
      rows,
      rowCount,
    });
    const B = backfill.SQL;
    const S = seed.SQL;
    const p = (i: number) => params[i];
    const parse = (value: unknown) =>
      typeof value === "string" ? JSON.parse(value) : value;

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
    if (
      text.startsWith("SET LOCAL ") ||
      text === B.advisoryLock ||
      text === S.advisoryLock
    ) {
      return result([]);
    }

    // ── Reads ──
    if (text === B.themes) {
      const rows = this.rows("community_theme")
        .map((ct) => {
          const preset = this.rows("qr_preset").find(
            (x) => x.id === ct.theme_id,
          );
          const user = this.rows("user").find((x) => x.id === ct.user_id);
          if (!(preset && user)) return null;
          return {
            id: ct.id,
            theme_id: ct.theme_id,
            user_id: ct.user_id,
            published_at: ct.published_at,
            like_count: ct.like_count,
            name: preset.name,
            style: preset.style,
            user_name: user.name,
            user_image: user.image ?? null,
            user_email: String(user.email).toLowerCase(),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      return result(rows);
    }
    if (text === B.tags) return result([...this.rows("community_theme_tag")]);
    if (text === B.likes) return result([...this.rows("theme_like")]);
    if (text === B.profiles) {
      return result(
        this.rows("community_profile").map(({ id, kind, user_id, handle }) => ({
          id,
          kind,
          user_id,
          handle,
        })),
      );
    }
    if (text === B.items) {
      return result(
        this.rows("community_item").map(
          ({ id, type, slug, status, legacy_community_theme_id }) => ({
            id,
            type,
            slug,
            status,
            legacy_community_theme_id: legacy_community_theme_id ?? null,
          }),
        ),
      );
    }
    if (text === S.items) {
      return result(
        this.rows("community_item").map(
          ({
            id,
            type,
            slug,
            status,
            payload_hash,
            profile_id,
            is_official,
            created_by,
          }) => ({
            id,
            type,
            slug,
            status: status ?? null,
            payload_hash: payload_hash ?? null,
            profile_id,
            is_official,
            created_by,
          }),
        ),
      );
    }
    if (text === B.officialUser || text === S.officialUser) {
      return result(
        this.rows("user")
          .filter((u) => String(u.email).toLowerCase() === p(0))
          .map(({ id }) => ({ id })),
      );
    }
    if (text === B.officialWorkspace || text === S.officialWorkspace) {
      return result(
        this.rows("organization")
          .filter((o) => o.slug === p(0))
          .map(({ id }) => ({ id })),
      );
    }
    if (text === B.personProfiles) {
      const ids = p(0) as string[];
      return result(
        this.rows("community_profile")
          .filter(
            (r) => r.kind === "person" && ids.includes(r.user_id as string),
          )
          .map(({ id, user_id }) => ({ id, user_id })),
      );
    }
    if (text === S.officialProfile) {
      return result(
        this.rows("community_profile")
          .filter((r) => r.kind === "official" || r.id === p(0))
          .map(({ id, user_id, workspace_id, verified_at }) => ({
            id,
            user_id,
            workspace_id,
            verified_at: verified_at ?? null,
          })),
      );
    }

    // ── Writes ──
    if (text === B.insertProfile) {
      return result(
        [],
        this.insert("community_profile", {
          id: p(0),
          kind: p(1),
          user_id: p(2),
          workspace_id: p(3),
          handle: p(4),
          display_name: p(5),
          avatar_url: p(6),
          verified_at: p(7),
          status: "active",
          created_at: p(8),
        }),
      );
    }
    if (text === S.insertProfile) {
      return result(
        [],
        this.insert("community_profile", {
          id: p(0),
          kind: "official",
          user_id: p(1),
          workspace_id: p(2),
          handle: p(3),
          display_name: "QRdx",
          verified_at: p(4),
          status: "active",
        }),
      );
    }
    if (text === S.verifyProfile) {
      const row = this.rows("community_profile").find(
        (r) => r.id === p(0) && !r.verified_at,
      );
      if (row) row.verified_at = p(1);
      return result([], row ? 1 : 0);
    }
    if (text === B.insertItem) {
      return result(
        [],
        this.insert("community_item", {
          id: p(0),
          type: "theme",
          slug: p(1),
          profile_id: p(2),
          created_by: p(3),
          name: p(4),
          status: "published",
          license: p(5),
          current_version: 1,
          payload: parse(p(6)),
          payload_hash: p(7),
          is_official: p(8),
          source_kind: "qr_preset",
          source_id: p(9),
          like_count: p(10),
          legacy_community_theme_id: p(11),
          published_at: p(12),
        }),
      );
    }
    if (text === S.insertItem) {
      return result(
        [],
        this.insert("community_item", {
          id: p(0),
          type: p(1),
          slug: p(2),
          profile_id: p(3),
          created_by: p(4),
          name: p(5),
          description: p(6),
          status: "published",
          license: p(7),
          current_version: 1,
          payload: parse(p(8)),
          payload_hash: p(9),
          facets: parse(p(10)),
          is_official: true,
          featured_at: p(11),
          published_at: p(12),
        }),
      );
    }
    if (text === B.insertVersion || text === S.insertVersion) {
      return result(
        [],
        this.insert("community_item_version", {
          id: p(0),
          item_id: p(1),
          version: 1,
          payload: parse(p(2)),
          payload_hash: p(3),
          created_by: p(4),
        }),
      );
    }
    if (text === B.insertTag || text === S.insertTag) {
      return result(
        [],
        this.insert("community_item_tag", { item_id: p(0), tag: p(1) }),
      );
    }
    if (text === B.insertLike) {
      return result(
        [],
        this.insert("community_like", {
          user_id: p(0),
          item_id: p(1),
          created_at: p(2),
        }),
      );
    }
    if (text === S.insertEntry) {
      return result(
        [],
        this.insert("community_collection_entry", {
          collection_id: p(0),
          item_id: p(1),
          position: p(2),
        }),
      );
    }
    if (text === B.removeItem) {
      const row = this.rows("community_item").find(
        (r) => r.id === p(0) && r.status !== "removed",
      );
      if (row) {
        row.status = "removed";
        row.removed_reason = "unpublished";
      }
      return result([], row ? 1 : 0);
    }
    if (text === S.adoptTheme) {
      const row = this.rows("community_item").find((r) => r.id === p(0));
      if (row) {
        row.profile_id = p(1);
        row.is_official = true;
      }
      return result([], row ? 1 : 0);
    }

    // ── Counts ──
    const n = (value: number) => result([{ n: value }]);
    const inList = (values: unknown) => new Set(values as string[]);
    if (text === B.countCopied) {
      const ids = inList(p(0));
      return n(
        this.rows("community_item").filter((r) =>
          ids.has(r.legacy_community_theme_id as string),
        ).length,
      );
    }
    if (text === B.countVersions) {
      const ids = inList(p(0));
      return n(
        this.rows("community_item_version").filter(
          (r) => ids.has(r.item_id as string) && r.version === 1,
        ).length,
      );
    }
    if (text === B.countTags) {
      const ids = inList(p(0));
      return n(
        this.rows("community_item_tag").filter((r) =>
          ids.has(r.item_id as string),
        ).length,
      );
    }
    if (text === B.countLikes) {
      const ids = inList(p(0));
      return n(
        this.rows("community_like").filter((r) => ids.has(r.item_id as string))
          .length,
      );
    }
    if (text === S.countSeeded) {
      const ids = inList(p(0));
      return n(
        this.rows("community_item").filter(
          (r) =>
            ids.has(r.id as string) &&
            r.is_official === true &&
            r.profile_id === p(1),
        ).length,
      );
    }
    if (text === S.countEntries) {
      const ids = inList(p(0));
      return n(
        this.rows("community_collection_entry").filter((r) =>
          ids.has(r.collection_id as string),
        ).length,
      );
    }
    throw new Error(`fake pg: unexpected statement: ${text.slice(0, 80)}`);
  }
}
