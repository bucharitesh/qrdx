// API keys on the REST API (/v1), as content/docs/developers/api-keys.mdx
// describes them: a `qrdx_` key in `Authorization: Bearer` acts on the
// workspace it was created in, as its creator, with their role there right
// now and never more, narrowed by its scopes. Revoked and expired keys, keys
// of banned users and team keys whose creator left the team get 401. OAuth
// tokens behave exactly as before. Before manual-sql/0011 creates the
// api_key table, keys get 401 and nothing answers 500.
//
// The route handlers run the real codes service against in-memory tables
// (tests/support/fake-db); only side systems are stubbed.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, repoDatabase } from "../support/fake-db";

const state = vi.hoisted(() => ({
  session: null as null | { userId: string; organizationId: string | null },
  plan: "free" as "free" | "pro" | "business",
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.session
          ? {
              user: { id: state.session.userId },
              session: { activeOrganizationId: state.session.organizationId },
            }
          : null,
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 1000,
      remaining: 999,
      reset: Date.now() + 42_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/app/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/app/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => null,
}));
vi.mock("@/lib/code-versions", () => ({ snapshotCodeVersion: async () => {} }));
vi.mock("@/lib/safety/destinations", () => ({
  screenNewCodes: async (_scope: unknown, rows: unknown[]) => rows,
  screenUrlChange: async () => false,
}));
vi.mock("@/lib/events/emit", () => ({
  emitCodesCreated: () => {},
  emitCodeUpdated: () => {},
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const list = await import("@/app/api/v1/codes/route");
const one = await import("@/app/api/v1/codes/[id]/route");
const themes = await import("@/app/api/v1/themes/route");
const theme = await import("@/app/api/v1/themes/[themeId]/route");
const me = await import("@/app/api/v1/me/route");

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-02T12:00:00Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** A syntactically valid key, unique per label. */
const keyFor = (label: string) =>
  `qrdx_${label
    .replace(/[^0-9A-Za-z]/g, "")
    .padEnd(40, "0")
    .slice(0, 40)}`;

const KEYS = {
  alicePersonal: keyFor("alicePersonal"),
  aliceTeam: keyFor("aliceTeam"),
  bobTeam: keyFor("bobTeam"),
  carolTeam: keyFor("carolTeam"),
  readOnly: keyFor("readOnly"),
  themesOnly: keyFor("themesOnly"),
};

const FULL = ["themes:read", "profile:read", "codes:read", "codes:write"];

function seedKey(
  key: string,
  overrides: Record<string, unknown> & { userId: string },
) {
  fakeDb.seed("apiKey", [
    {
      id: `key_${key.slice(5, 15)}`,
      name: "Test key",
      keyHash: sha256(key),
      start: key.slice(0, 11),
      organizationId: null,
      scopes: FULL,
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    },
  ]);
}

let codeSeq = 0;
function code(overrides: Record<string, unknown> = {}) {
  codeSeq += 1;
  return {
    id: `code_${codeSeq}`,
    userId: "u_alice",
    organizationId: null,
    slug: `Code${String(codeSeq).padStart(3, "0")}`,
    destinationUrl: `https://example.com/${codeSeq}`,
    title: `Code ${codeSeq}`,
    createdAt: new Date(NOW.getTime() - codeSeq * 1000),
    updatedAt: new Date(NOW.getTime() - codeSeq * 1000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  fakeDb.defaults("qrCode", () => ({
    slugScope: "",
    contentType: "url",
    style: null,
    title: null,
    domainId: null,
    isActive: true,
    archivedAt: null,
    scanCount: 0,
    lastScannedAt: null,
    kind: "redirect",
    pageId: null,
    folderId: null,
    notes: null,
    isFavorite: false,
    pausedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  fakeDb.unique("qrCode", "slug");
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.unique("qrCode", "domainId", "slug");
  fakeDb.unique("apiKey", "keyHash");
  fakeDb.seed("user", [
    {
      id: "u_alice",
      name: "Alice",
      email: "alice@example.com",
      image: null,
      banned: false,
      banExpires: null,
    },
    { id: "u_bob", name: "Bob", banned: false, banExpires: null },
    { id: "u_carol", name: "Carol", banned: false, banExpires: null },
  ]);
  fakeDb.seed("oauthApp", [{ id: "app_1", isActive: true }]);
  fakeDb.seed("member", [
    { id: "m1", organizationId: "org_acme", userId: "u_alice", role: "owner" },
    { id: "m2", organizationId: "org_acme", userId: "u_bob", role: "member" },
    { id: "m3", organizationId: "org_acme", userId: "u_carol", role: "admin" },
  ]);
  seedKey(KEYS.alicePersonal, { userId: "u_alice" });
  seedKey(KEYS.aliceTeam, { userId: "u_alice", organizationId: "org_acme" });
  seedKey(KEYS.bobTeam, { userId: "u_bob", organizationId: "org_acme" });
  seedKey(KEYS.carolTeam, { userId: "u_carol", organizationId: "org_acme" });
  seedKey(KEYS.readOnly, {
    userId: "u_alice",
    scopes: ["themes:read", "profile:read", "codes:read"],
  });
  seedKey(KEYS.themesOnly, { userId: "u_alice", scopes: ["themes:read"] });
  state.session = null;
  state.plan = "free";
  codeSeq = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Requests ───────────────────────────────────────────────────────────────

function request(method: string, path: string, token?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(new URL(path, ORIGIN), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const listCodes = (token?: string) =>
  list.GET(request("GET", "/api/v1/codes", token));
const createCode = (token: string, body: unknown) =>
  list.POST(request("POST", "/api/v1/codes", token, body));
const deleteCode = (token: string, id: string) =>
  one.DELETE(request("DELETE", `/api/v1/codes/${id}`, token), ctx(id));

interface ApiError {
  code: string;
  message: string;
  status: number;
  docs?: string;
  error?: string;
}
const json = async <T>(response: Response) => (await response.json()) as T;
const titles = async (response: Response) =>
  (await json<{ data: { title: string }[] }>(response)).data.map(
    (c) => c.title,
  );

const KEYS_DOCS = "http://localhost:3000/docs/developers/api-keys";

// ─── Workspaces ─────────────────────────────────────────────────────────────

describe("which workspace a key acts on", () => {
  beforeEach(() => {
    fakeDb.seed("qrCode", [
      code({ title: "Personal" }),
      code({ title: "Team", organizationId: "org_acme", userId: "u_bob" }),
      code({ title: "Bob's personal", userId: "u_bob" }),
    ]);
  });

  it("a personal key reads and writes the creator's personal workspace", async () => {
    const response = await listCodes(KEYS.alicePersonal);
    expect(response.status).toBe(200);
    expect(await titles(response)).toEqual(["Personal"]);

    const created = await createCode(KEYS.alicePersonal, {
      destinationUrl: "https://example.com/new",
    });
    expect(created.status).toBe(201);
    expect(
      (await json<{ data: { organizationId: string | null } }>(created)).data
        .organizationId,
    ).toBeNull();
  });

  it("a team key reads and writes that team, and nothing else", async () => {
    expect(await titles(await listCodes(KEYS.aliceTeam))).toEqual(["Team"]);
    expect(await titles(await listCodes(KEYS.bobTeam))).toEqual(["Team"]);

    const created = await createCode(KEYS.bobTeam, {
      destinationUrl: "https://example.com/team",
    });
    expect(created.status).toBe(201);
    const row = fakeDb.find("qrCode", {
      destinationUrl: "https://example.com/team",
    });
    expect(row).toMatchObject({ organizationId: "org_acme", userId: "u_bob" });

    // Another workspace's code looks exactly like a missing one.
    const personal = await one.GET(
      request("GET", "/api/v1/codes/code_1", KEYS.bobTeam),
      ctx("code_1"),
    );
    expect(personal.status).toBe(404);
  });
});

// ─── Roles ──────────────────────────────────────────────────────────────────

describe("a team key never does more than its creator may", () => {
  beforeEach(() => {
    fakeDb.seed("qrCode", [
      code({ organizationId: "org_acme", userId: "u_alice" }),
      code({ organizationId: "org_acme", userId: "u_bob" }),
      code({ organizationId: "org_acme", userId: "u_alice" }),
    ]);
  });

  it("a member's key deletes only the member's own codes", async () => {
    const denied = await deleteCode(KEYS.bobTeam, "code_1");
    expect(denied.status).toBe(403);
    expect((await json<ApiError>(denied)).code).toBe("FORBIDDEN");
    expect((await deleteCode(KEYS.bobTeam, "code_2")).status).toBe(200);
  });

  it("an admin's key deletes any code of the team", async () => {
    expect((await deleteCode(KEYS.carolTeam, "code_1")).status).toBe(200);
  });

  it("follows the creator's role at request time, not at creation", async () => {
    const membership = fakeDb.find("member", { id: "m3" });
    if (membership) membership.role = "member";
    expect((await deleteCode(KEYS.carolTeam, "code_1")).status).toBe(403);
    if (membership) membership.role = "member,admin";
    expect((await deleteCode(KEYS.carolTeam, "code_1")).status).toBe(200);
  });

  it("stops working when its creator leaves the team", async () => {
    const rows = fakeDb.rows("member");
    rows.splice(
      rows.findIndex((row) => row.id === "m2"),
      1,
    );
    const response = await listCodes(KEYS.bobTeam);
    expect(response.status).toBe(401);
    expect((await json<ApiError>(response)).code).toBe("INVALID_TOKEN");
    // Bob's personal key would still work; his team key does not.
    seedKey(keyFor("bobPersonal"), { userId: "u_bob" });
    expect((await listCodes(keyFor("bobPersonal"))).status).toBe(200);
  });
});

// ─── Bad keys ───────────────────────────────────────────────────────────────

describe("keys that don't authenticate", () => {
  async function expectInvalidKey(response: Response) {
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="QRdx API", error="invalid_token"',
    );
    const body = await json<ApiError>(response);
    expect(body.code).toBe("INVALID_TOKEN");
    expect(body.message).toMatch(/^Invalid API key/);
    expect(body.docs).toBe(KEYS_DOCS);
  }

  it("refuses unknown and truncated keys", async () => {
    await expectInvalidKey(await listCodes(keyFor("neverIssued")));
    await expectInvalidKey(await listCodes(KEYS.alicePersonal.slice(0, -3)));
  });

  it("refuses a revoked key at once", async () => {
    expect((await listCodes(KEYS.alicePersonal)).status).toBe(200);
    const row = fakeDb.find("apiKey", { keyHash: sha256(KEYS.alicePersonal) });
    if (row) row.revokedAt = NOW;
    await expectInvalidKey(await listCodes(KEYS.alicePersonal));
  });

  it("refuses a key once it expires", async () => {
    const row = fakeDb.find("apiKey", { keyHash: sha256(KEYS.alicePersonal) });
    if (row) row.expiresAt = new Date(NOW.getTime() + DAY);
    expect((await listCodes(KEYS.alicePersonal)).status).toBe(200);
    vi.setSystemTime(NOW.getTime() + DAY);
    await expectInvalidKey(await listCodes(KEYS.alicePersonal));
  });

  it("refuses the keys of a banned user while the ban lasts", async () => {
    const alice = fakeDb.find("user", { id: "u_alice" });
    if (alice) {
      alice.banned = true;
      alice.banExpires = new Date(NOW.getTime() + DAY);
    }
    await expectInvalidKey(await listCodes(KEYS.alicePersonal));
    vi.setSystemTime(NOW.getTime() + 2 * DAY);
    expect((await listCodes(KEYS.alicePersonal)).status).toBe(200);
  });

  it("never matches on anything but the full key's hash", async () => {
    // The stored start isn't a credential.
    await expectInvalidKey(
      await listCodes(`${KEYS.alicePersonal.slice(0, 11)}${"0".repeat(34)}`),
    );
  });
});

// ─── Scopes ─────────────────────────────────────────────────────────────────

describe("key scopes", () => {
  it("a read-only key reads but can't write", async () => {
    expect((await listCodes(KEYS.readOnly)).status).toBe(200);
    const denied = await createCode(KEYS.readOnly, {
      destinationUrl: "https://example.com",
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("www-authenticate")).toBe(
      'Bearer realm="QRdx API", error="insufficient_scope", scope="codes:write"',
    );
    const body = await json<ApiError>(denied);
    expect(body).toMatchObject({
      code: "INSUFFICIENT_SCOPE",
      message:
        "This API key needs the 'codes:write' scope. Create a key that includes it at http://localhost:3000/settings/developers; a key's scopes can't be changed.",
      docs: KEYS_DOCS,
    });
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("a key without a codes scope can't touch codes", async () => {
    const response = await listCodes(KEYS.themesOnly);
    expect(response.status).toBe(403);
    expect((await json<ApiError>(response)).code).toBe("INSUFFICIENT_SCOPE");
  });

  it("/v1/me needs profile:read, with the OAuth fields it always sent", async () => {
    const denied = await me.GET(request("GET", "/api/v1/me", KEYS.themesOnly));
    expect(denied.status).toBe(403);
    expect(await json<ApiError>(denied)).toMatchObject({
      error: "insufficient_scope",
      code: "INSUFFICIENT_SCOPE",
    });

    const ok = await me.GET(request("GET", "/api/v1/me", KEYS.alicePersonal));
    expect(ok.status).toBe(200);
    expect(await json(ok)).toEqual({
      data: {
        id: "u_alice",
        name: "Alice",
        email: "alice@example.com",
        image: null,
      },
    });
  });
});

// ─── Themes ─────────────────────────────────────────────────────────────────

describe("/v1/themes with a key", () => {
  beforeEach(() => {
    fakeDb.seed("qrPreset", [
      {
        id: "t_personal",
        userId: "u_alice",
        organizationId: null,
        name: "Mine",
        style: {},
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: "t_team",
        userId: "u_bob",
        organizationId: "org_acme",
        name: "Team blue",
        style: {},
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: "t_other",
        userId: "u_carol",
        organizationId: null,
        name: "Carol's",
        style: {},
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  });
  const names = async (token: string) =>
    (
      await json<{ data: { name: string }[] }>(
        await themes.GET(request("GET", "/api/v1/themes", token)),
      )
    ).data.map((t) => t.name);

  it("a personal key reads its creator's themes", async () => {
    expect(await names(KEYS.alicePersonal)).toEqual(["Mine"]);
  });

  it("a team key reads the team's themes, not its creator's personal ones", async () => {
    expect(await names(KEYS.aliceTeam)).toEqual(["Team blue"]);
    const personal = await theme.GET(
      request("GET", "/api/v1/themes/t_personal", KEYS.aliceTeam),
      { params: Promise.resolve({ themeId: "t_personal" }) },
    );
    expect(personal.status).toBe(404);
    const team = await theme.GET(
      request("GET", "/api/v1/themes/t_team", KEYS.aliceTeam),
      { params: Promise.resolve({ themeId: "t_team" }) },
    );
    expect(team.status).toBe(200);
  });

  it("answers a bad key with the API and OAuth error fields", async () => {
    const response = await themes.GET(
      request("GET", "/api/v1/themes", keyFor("nope")),
    );
    expect(response.status).toBe(401);
    expect(await json<ApiError>(response)).toMatchObject({
      error: "invalid_token",
      code: "INVALID_TOKEN",
      docs: KEYS_DOCS,
    });
  });
});

// ─── Last used ──────────────────────────────────────────────────────────────

describe("last used", () => {
  const lastUsed = () =>
    fakeDb.find("apiKey", { keyHash: sha256(KEYS.alicePersonal) })?.lastUsedAt;

  it("records the time of use, at most once a minute", async () => {
    expect(lastUsed()).toBeNull();
    await listCodes(KEYS.alicePersonal);
    expect(lastUsed()).toEqual(NOW);

    vi.setSystemTime(NOW.getTime() + 30_000);
    await listCodes(KEYS.alicePersonal);
    expect(lastUsed()).toEqual(NOW);

    vi.setSystemTime(NOW.getTime() + 2 * MINUTE);
    await listCodes(KEYS.alicePersonal);
    expect(lastUsed()).toEqual(new Date(NOW.getTime() + 2 * MINUTE));
  });

  it("doesn't touch keys that fail", async () => {
    const row = fakeDb.find("apiKey", { keyHash: sha256(KEYS.alicePersonal) });
    if (row) row.revokedAt = NOW;
    await listCodes(KEYS.alicePersonal);
    expect(lastUsed()).toBeNull();
  });
});

// ─── Unchanged for everyone else ────────────────────────────────────────────

describe("OAuth tokens and sessions are unaffected", () => {
  beforeEach(() => {
    fakeDb.seed("oauthToken", [
      {
        id: "tok_1",
        accessTokenHash: sha256("oauth-token"),
        appId: "app_1",
        userId: "u_alice",
        scopes: ["codes:read"],
        accessTokenExpiresAt: new Date(NOW.getTime() + 60 * MINUTE),
        revokedAt: null,
      },
    ]);
    fakeDb.seed("qrCode", [
      code({ title: "Personal" }),
      code({ title: "Team", organizationId: "org_acme" }),
    ]);
  });

  it("an OAuth token still acts on the personal workspace, with OAuth wording", async () => {
    expect(await titles(await listCodes("oauth-token"))).toEqual(["Personal"]);
    const unknown = await json<ApiError>(await listCodes("made-up-token"));
    expect(unknown.code).toBe("INVALID_TOKEN");
    expect(unknown.message).toMatch(/refresh token/);
    expect(unknown.docs).toBe(
      "http://localhost:3000/docs/developers/rest-api#get-an-access-token",
    );
  });

  it("anonymous callers learn to send an API key", async () => {
    const response = await listCodes();
    expect(response.status).toBe(401);
    expect(await json(response)).toEqual({
      code: "UNAUTHORIZED",
      message:
        'Missing API key. Send an API key as "Authorization: Bearer <key>"; create one at http://localhost:3000/settings/developers. OAuth access tokens go in the same header.',
      status: 401,
      docs: KEYS_DOCS,
    });
  });
});

// ─── Before the SQL is applied ──────────────────────────────────────────────

describe("before manual-sql/0011 creates the api_key table", () => {
  beforeEach(() => {
    // Make every query that reads api_key fail the way Postgres does.
    const database = repoDatabase.database as {
      select: (...args: unknown[]) => { from: (table: unknown) => unknown };
    };
    const select = database.select.bind(database);
    vi.spyOn(database, "select").mockImplementation((...args: unknown[]) => {
      const query = select(...args);
      const from = query.from.bind(query);
      query.from = (table: unknown) => {
        if ((table as { __table?: string }).__table === "apiKey") {
          const error = new Error('Failed query: select ... from "api_key"');
          (error as Error & { cause: unknown }).cause = Object.assign(
            new Error('relation "api_key" does not exist'),
            { code: "42P01" },
          );
          throw error;
        }
        return from(table);
      };
      return query;
    });
    fakeDb.seed("oauthToken", [
      {
        id: "tok_1",
        accessTokenHash: sha256("oauth-token"),
        appId: "app_1",
        userId: "u_alice",
        scopes: ["codes:read", "themes:read"],
        accessTokenExpiresAt: new Date(NOW.getTime() + 60 * MINUTE),
        revokedAt: null,
      },
    ]);
  });

  it("answers a key with 401, never 500", async () => {
    const response = await listCodes(KEYS.alicePersonal);
    expect(response.status).toBe(401);
    expect((await json<ApiError>(response)).code).toBe("INVALID_TOKEN");
    const themesResponse = await themes.GET(
      request("GET", "/api/v1/themes", KEYS.alicePersonal),
    );
    expect(themesResponse.status).toBe(401);
  });

  it("keeps OAuth tokens and anonymous calls working as before", async () => {
    expect((await listCodes("oauth-token")).status).toBe(200);
    expect(
      (await themes.GET(request("GET", "/api/v1/themes", "oauth-token")))
        .status,
    ).toBe(200);
    expect((await listCodes()).status).toBe(401);
  });
});
