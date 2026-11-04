// Workspace join links (lib/workspace-join.ts, actions/workspace-join.ts)
// and moving a code to another workspace (app/dashboard/codes/_lib/
// move-workspace.ts), against in-memory tables. Better Auth's addMember is
// a small fake that adds the member row, as the plugin does.
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro_monthly";
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID =
    "prod_business_monthly";
  return {
    scope: null as null | {
      userId: string;
      organizationId: string;
      role: "owner" | "admin" | "member" | "billing" | "viewer";
    },
    user: null as null | { id: string; email: string },
    missingTable: false,
    addMemberError: null as null | string,
  };
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock("@repo/database", async () => {
  const { repoDatabase } = await import("../support/fake-db");
  const db = repoDatabase.database as Record<
    string,
    (...args: unknown[]) => unknown
  >;
  // Until manual-sql/0014 is applied, Postgres answers 42P01 for the table.
  const missing = (table: unknown) =>
    state.missingTable &&
    (table as { __table?: string })?.__table === "workspaceJoinLink";
  const fail = () => {
    throw Object.assign(
      new Error('relation "workspace_join_link" does not exist'),
      {
        code: "42P01",
      },
    );
  };
  const wrapped = new Proxy(db, {
    get(target, prop) {
      const value = target[prop as string];
      if (prop === "insert" || prop === "update" || prop === "delete") {
        return (table: unknown) => (missing(table) ? fail() : value(table));
      }
      if (prop === "select") {
        return (shape?: unknown) => {
          const query = value(shape) as Record<string, (t: unknown) => unknown>;
          const from = query.from;
          query.from = (table: unknown) =>
            missing(table) ? fail() : from(table);
          return query;
        };
      }
      return value;
    },
  });
  return { ...repoDatabase, database: wrapped };
});
vi.mock(
  "@repo/database/schema",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-real-ip": "203.0.113.9" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({ success: true, limit: 10, remaining: 9, reset: 0 }),
  }),
}));
vi.mock("@/lib/shared", () => ({
  logError: () => {},
  getCurrentUser: async () => {
    if (!state.user) {
      const { UnauthorizedError } = await import("@/types/errors");
      throw new UnauthorizedError();
    }
    return state.user;
  },
}));
vi.mock("@/lib/scope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scope")>()),
  getActiveScope: vi.fn(async () => {
    if (!state.scope) throw new Error("no scope");
    return state.scope;
  }),
}));
vi.mock("@repo/auth/server", async () => {
  const { fakeDb: db } = await import("../support/fake-db");
  return {
    auth: {
      api: {
        addMember: async ({ body }: { body: Record<string, string> }) => {
          if (state.addMemberError) {
            throw Object.assign(new Error(state.addMemberError), {
              statusCode: 400,
              body: { code: state.addMemberError },
            });
          }
          db.seed("member", [
            {
              id: `m_${body.userId}_${body.organizationId}`,
              organizationId: body.organizationId,
              userId: body.userId,
              role: body.role,
              createdAt: new Date(),
            },
          ]);
          return {};
        },
      },
    },
  };
});

const join = await import("@/actions/workspace-join");
const { findJoinTarget, joinLinkPath } = await import("@/lib/workspace-join");
const { moveCodeToWorkspace } = await import(
  "@/app/dashboard/codes/_lib/move-workspace"
);

const NOW = new Date("2026-11-04T12:00:00Z");

// The table's primary key and unique token, as in schema.ts (the fake only
// knows the keys it's told).
fakeDb.unique("workspaceJoinLink", "organizationId");
fakeDb.unique("workspaceJoinLink", "tokenHash");

function person(id: string) {
  fakeDb.seed("user", [
    { id, name: id, email: `${id}@example.com`, createdAt: NOW },
  ]);
}
function workspace(id: string, slug: string) {
  fakeDb.seed("organization", [
    { id, name: `Team ${slug}`, slug, logo: null, createdAt: NOW },
  ]);
}
let seq = 0;
function member(organizationId: string, userId: string, role: string) {
  seq += 1;
  fakeDb.seed("member", [
    { id: `m_${seq}`, organizationId, userId, role, createdAt: NOW },
  ]);
}
function subscribe(userId: string, plan: "pro" | "business") {
  fakeDb.seed("subscription", [
    {
      id: `sub_${userId}`,
      userId,
      productId: plan === "pro" ? "prod_pro_monthly" : "prod_business_monthly",
      status: "active",
      createdAt: NOW,
    },
  ]);
}
function signIn(
  userId: string,
  organizationId: string,
  role: NonNullable<typeof state.scope>["role"],
) {
  state.scope = { userId, organizationId, role };
  state.user = { id: userId, email: `${userId}@example.com` };
}
const tokenOf = (path: string) => path.replace(/^\/join\//, "");

beforeEach(() => {
  fakeDb.reset();
  state.scope = null;
  state.user = null;
  state.missingTable = false;
  state.addMemberError = null;
  person("u_owner");
  person("u_admin");
  person("u_new");
  workspace("org_t", "team-t");
  member("org_t", "u_owner", "owner");
  member("org_t", "u_admin", "admin");
  subscribe("u_owner", "pro"); // Pro: 3 seats
});

// ─── Join links ─────────────────────────────────────────────────────────────

describe("join links", () => {
  it("stores only the token's hash, and finds the workspace by the token", async () => {
    signIn("u_owner", "org_t", "owner");
    const made = await join.issueWorkspaceJoinLink({ role: "viewer" });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    const token = tokenOf(made.data.path);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(made.data.path).toBe(joinLinkPath(token));

    const [row] = fakeDb.rows("workspaceJoinLink");
    expect(row?.tokenHash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(JSON.stringify(fakeDb.rows("workspaceJoinLink"))).not.toContain(
      token,
    );

    expect(await findJoinTarget(token)).toMatchObject({
      organizationId: "org_t",
      slug: "team-t",
      role: "viewer",
    });
    expect(await findJoinTarget("x".repeat(43))).toBeNull();
    expect(await findJoinTarget("short")).toBeNull();
  });

  it("joins with the link's role, then says you're already in", async () => {
    signIn("u_owner", "org_t", "owner");
    const made = await join.issueWorkspaceJoinLink({ role: "viewer" });
    if (!made.ok) throw new Error(made.error);

    signIn("u_new", "org_t", "viewer");
    const first = await join.joinWorkspaceWithLink({
      token: tokenOf(made.data.path),
    });
    expect(first).toEqual({
      ok: true,
      data: { status: "joined", slug: "team-t", role: "viewer" },
    });
    expect(
      fakeDb.find("member", { userId: "u_new", organizationId: "org_t" })?.role,
    ).toBe("viewer");

    const again = await join.joinWorkspaceWithLink({
      token: tokenOf(made.data.path),
    });
    expect(again).toEqual({
      ok: true,
      data: { status: "already", slug: "team-t" },
    });
  });

  it("stops the old link on reset and every link when turned off", async () => {
    signIn("u_owner", "org_t", "owner");
    const first = await join.issueWorkspaceJoinLink({ role: "member" });
    const second = await join.issueWorkspaceJoinLink({});
    if (!(first.ok && second.ok)) throw new Error("issue failed");
    // A reset keeps the role.
    expect(second.data.role).toBe("member");
    expect(fakeDb.rows("workspaceJoinLink")).toHaveLength(1);
    expect(await findJoinTarget(tokenOf(first.data.path))).toBeNull();
    expect(await findJoinTarget(tokenOf(second.data.path))).not.toBeNull();

    expect((await join.disableWorkspaceJoinLink()).ok).toBe(true);
    expect(fakeDb.rows("workspaceJoinLink")).toHaveLength(0);
    signIn("u_new", "org_t", "member");
    expect(
      await join.joinWorkspaceWithLink({ token: tokenOf(second.data.path) }),
    ).toMatchObject({ ok: false, code: "JOIN_LINK_INVALID" });
  });

  it("returns LIMIT_REACHED when the plan's seats are taken", async () => {
    signIn("u_owner", "org_t", "owner");
    const made = await join.issueWorkspaceJoinLink({ role: "member" });
    if (!made.ok) throw new Error(made.error);
    // Pro has 3 seats: owner, admin and a pending invitation fill them.
    fakeDb.seed("invitation", [
      {
        id: "inv_1",
        organizationId: "org_t",
        email: "someone@example.com",
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: NOW,
        inviterId: "u_owner",
      },
    ]);
    signIn("u_new", "org_t", "member");
    const full = await join.joinWorkspaceWithLink({
      token: tokenOf(made.data.path),
    });
    expect(full).toMatchObject({ ok: false, code: "LIMIT_REACHED" });
    expect(fakeDb.find("member", { userId: "u_new" })).toBeUndefined();

    // The invitation is the joiner's own: its seat is theirs.
    fakeDb.rows("invitation")[0].email = "u_new@example.com";
    expect(
      await join.joinWorkspaceWithLink({ token: tokenOf(made.data.path) }),
    ).toMatchObject({ ok: true, data: { status: "joined" } });

    // The plugin's own membership limit maps to the same code.
    state.addMemberError = "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED";
    person("u_late");
    signIn("u_late", "org_t", "member");
    fakeDb.rows("invitation").splice(0);
    expect(
      await join.joinWorkspaceWithLink({ token: tokenOf(made.data.path) }),
    ).toMatchObject({ ok: false, code: "LIMIT_REACHED" });
  });

  it("lets only owners make a link that gives the billing role, and never owner", async () => {
    signIn("u_admin", "org_t", "admin");
    expect(
      await join.issueWorkspaceJoinLink({ role: "billing" }),
    ).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      await join.issueWorkspaceJoinLink({ role: "owner" as "member" }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect((await join.issueWorkspaceJoinLink({ role: "viewer" })).ok).toBe(
      true,
    );

    signIn("u_owner", "org_t", "owner");
    expect((await join.issueWorkspaceJoinLink({ role: "billing" })).ok).toBe(
      true,
    );
    // An admin can't reset or re-role a billing link an owner made.
    signIn("u_admin", "org_t", "admin");
    expect(await join.issueWorkspaceJoinLink({})).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      await join.setWorkspaceJoinLinkRole({ role: "member" }),
    ).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("fails with a clear error, not a 500, until the table exists", async () => {
    state.missingTable = true;
    signIn("u_owner", "org_t", "owner");
    expect(await join.issueWorkspaceJoinLink({ role: "member" })).toEqual({
      ok: false,
      code: "JOIN_LINKS_UNAVAILABLE",
      error:
        "Join links aren't set up on this server yet. Invite people by email for now.",
    });
    signIn("u_new", "org_t", "member");
    expect(
      await join.joinWorkspaceWithLink({ token: "a".repeat(43) }),
    ).toMatchObject({ ok: false, code: "JOIN_LINKS_UNAVAILABLE" });
  });

  it("asks signed-out visitors to sign in", async () => {
    expect(
      await join.joinWorkspaceWithLink({ token: "a".repeat(43) }),
    ).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
    });
  });
});

// ─── Moving a code ──────────────────────────────────────────────────────────

function code(id: string, values: Record<string, unknown> = {}) {
  fakeDb.seed("qrCode", [
    {
      id,
      userId: "u_owner",
      organizationId: "org_t",
      slug: `s${id}`,
      slugScope: "",
      destinationUrl: "https://example.com/",
      title: id,
      contentType: "url",
      style: null,
      domainId: null,
      isActive: true,
      archivedAt: null,
      scanCount: 3,
      lastScannedAt: null,
      kind: "redirect",
      pageId: null,
      folderId: null,
      notes: null,
      isFavorite: false,
      passwordHash: null,
      startsAt: null,
      expiresAt: null,
      scanLimit: null,
      pausedAt: null,
      fallbackUrl: null,
      routing: null,
      utm: null,
      pixels: null,
      deletedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...values,
    },
  ]);
}

describe("moving a code to another workspace", () => {
  beforeEach(() => {
    workspace("org_b", "team-b");
    member("org_b", "u_owner", "owner");
    member("org_b", "u_admin", "member");
  });

  it("keeps the short link, scans and history; leaves folder and tags behind", async () => {
    code("c1", { folderId: "f1" });
    fakeDb.seed("folder", [
      {
        id: "f1",
        userId: "u_owner",
        organizationId: "org_t",
        parentId: null,
        name: "F",
        position: 0,
        createdAt: NOW,
      },
    ]);
    fakeDb.seed("tag", [
      {
        id: "t1",
        userId: "u_owner",
        organizationId: "org_t",
        name: "T",
        color: null,
        createdAt: NOW,
      },
    ]);
    fakeDb.seed("qrCodeTag", [{ qrCodeId: "c1", tagId: "t1" }]);
    fakeDb.seed("qrScan", [{ id: "scan_1", qrCodeId: "c1", scannedAt: NOW }]);
    fakeDb.seed("qrCodeVersion", [
      {
        id: "v1",
        qrCodeId: "c1",
        snapshot: {},
        createdBy: "u_owner",
        createdAt: NOW,
      },
    ]);

    const result = await moveCodeToWorkspace(
      { userId: "u_owner", organizationId: "org_t", role: "owner" },
      "c1",
      "org_b",
    );
    expect(result.target).toEqual({
      id: "org_b",
      name: "Team team-b",
      slug: "team-b",
    });
    expect(result.leftBehind).toEqual({ folder: true, tags: 1 });
    expect(result.code.slug).toBe("sc1");
    const row = fakeDb.find("qrCode", { id: "c1" });
    expect(row).toMatchObject({
      organizationId: "org_b",
      slug: "sc1",
      slugScope: "",
      folderId: null,
      userId: "u_owner",
      scanCount: 3,
    });
    expect(fakeDb.rows("qrCodeTag")).toHaveLength(0);
    expect(fakeDb.find("qrScan", { id: "scan_1" })?.qrCodeId).toBe("c1");
    expect(fakeDb.find("qrCodeVersion", { id: "v1" })?.qrCodeId).toBe("c1");
  });

  it("refuses a code on a custom domain the target doesn't have", async () => {
    fakeDb.seed("customDomain", [
      {
        id: "d1",
        userId: "u_owner",
        organizationId: "org_t",
        hostname: "go.example.com",
        verified: true,
        verification: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    code("c2", { domainId: "d1", slugScope: "d1" });
    await expect(
      moveCodeToWorkspace(
        { userId: "u_owner", organizationId: "org_t", role: "owner" },
        "c2",
        "org_b",
      ),
    ).rejects.toMatchObject({
      code: "DOMAIN_NOT_IN_TARGET",
      message:
        "This code's link is on go.example.com, which Team team-b doesn't have. Its printed link would stop working, so it can't move.",
    });
    expect(fakeDb.find("qrCode", { id: "c2" })?.organizationId).toBe("org_t");
  });

  it("needs edit rights in both workspaces", async () => {
    code("c3");
    // u_admin is an admin here and only a viewer in org_b.
    fakeDb.find("member", {
      organizationId: "org_b",
      userId: "u_admin",
    })!.role = "viewer";
    await expect(
      moveCodeToWorkspace(
        { userId: "u_admin", organizationId: "org_t", role: "admin" },
        "c3",
        "org_b",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // A member here may move only what they created.
    fakeDb.find("member", {
      organizationId: "org_b",
      userId: "u_admin",
    })!.role = "member";
    await expect(
      moveCodeToWorkspace(
        { userId: "u_admin", organizationId: "org_t", role: "member" },
        "c3",
        "org_b",
      ),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message:
        "Only owners and admins can move codes that other members created.",
    });

    // Not a member of the target at all: it doesn't exist for them.
    workspace("org_c", "team-c");
    await expect(
      moveCodeToWorkspace(
        { userId: "u_admin", organizationId: "org_t", role: "admin" },
        "c3",
        "org_c",
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fakeDb.find("qrCode", { id: "c3" })?.organizationId).toBe("org_t");
  });

  it("hands the code to the mover when its creator isn't in the target", async () => {
    code("c4", { userId: "u_new" });
    await moveCodeToWorkspace(
      { userId: "u_admin", organizationId: "org_t", role: "admin" },
      "c4",
      "org_b",
    );
    expect(fakeDb.find("qrCode", { id: "c4" })).toMatchObject({
      organizationId: "org_b",
      userId: "u_admin",
    });
  });

  it("respects the target plan's active-code limit", async () => {
    // org_b's only owner moves to Free (10 active codes) with 10 there.
    fakeDb.rows("subscription").splice(0);
    for (let i = 0; i < 10; i++) code(`full${i}`, { organizationId: "org_b" });
    code("c5");
    await expect(
      moveCodeToWorkspace(
        { userId: "u_owner", organizationId: "org_t", role: "owner" },
        "c5",
        "org_b",
      ),
    ).rejects.toMatchObject({ code: "LIMIT_REACHED" });
    expect(fakeDb.find("qrCode", { id: "c5" })?.organizationId).toBe("org_t");

    // An archived code takes no slot, so it can move.
    fakeDb.find("qrCode", { id: "c5" })!.archivedAt = NOW;
    await moveCodeToWorkspace(
      { userId: "u_owner", organizationId: "org_t", role: "owner" },
      "c5",
      "org_b",
    );
    expect(fakeDb.find("qrCode", { id: "c5" })?.organizationId).toBe("org_b");
  });

  it("keeps hosted-page codes where their page is", async () => {
    code("c6", { kind: "page", pageId: "p1" });
    await expect(
      moveCodeToWorkspace(
        { userId: "u_owner", organizationId: "org_t", role: "owner" },
        "c6",
        "org_b",
      ),
    ).rejects.toMatchObject({ code: "PAGE_CODE" });
  });
});
