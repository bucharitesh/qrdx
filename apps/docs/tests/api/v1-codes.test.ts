// REST API v1 dynamic codes, as content/docs/developers/rest-api.mdx and
// content/docs/plans-and-limits.mdx describe them: who may call (OAuth
// scopes, browser sessions, CSRF), what each plan allows (10 active codes on
// Free, bulk creation on Pro, archived codes free a slot) and the JSON shapes.
// The route handlers run the real codes service (app/dashboard/codes/_lib)
// against in-memory tables; only side systems (URL safety lookups, custom
// domains, version history, webhooks) are stubbed.
import { createHash } from "node:crypto";
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  session: null as null | { userId: string; organizationId: string | null },
  plan: "free" as "free" | "pro" | "business",
  rateLimited: false,
  emitted: [] as { event: string; ids: string[] }[],
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
      success: !state.rateLimited,
      limit: 30,
      remaining: state.rateLimited ? 0 : 29,
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
  emitCodesCreated: (_scope: unknown, codes: { id: string }[]) =>
    state.emitted.push({ event: "code.created", ids: codes.map((c) => c.id) }),
  emitCodeUpdated: (_scope: unknown, code: { id: string }) =>
    state.emitted.push({ event: "code.updated", ids: [code.id] }),
}));
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: () => {},
}));

const list = await import("@/app/api/v1/codes/route");
const one = await import("@/app/api/v1/codes/[id]/route");

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-01T12:00:00Z");
const HOUR = 3_600_000;

// ─── Fixtures ───────────────────────────────────────────────────────────────

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** An access token for `userId` with `scopes`, valid for an hour. */
function grant(token: string, userId: string, scopes: string[]) {
  fakeDb.seed("oauthToken", [
    {
      id: `tok_${token}`,
      accessTokenHash: sha256(token),
      refreshTokenHash: sha256(`${token}-refresh`),
      appId: "app_1",
      userId,
      scopes,
      accessTokenExpiresAt: new Date(NOW.getTime() + HOUR),
      refreshTokenExpiresAt: new Date(NOW.getTime() + 30 * 24 * HOUR),
      revokedAt: null,
    },
  ]);
}

let codeSeq = 0;
function code(overrides: Record<string, unknown> = {}) {
  codeSeq += 1;
  const slug = `Code${String(codeSeq).padStart(3, "0")}`;
  return {
    id: `code_${codeSeq}`,
    userId: "u_alice",
    organizationId: null,
    slug,
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
  // Workspaces are organizations; members point at them.
  fakeDb.seed("organization", [
    { id: "org_acme", name: "Acme", slug: "acme", createdAt: new Date(0) },
  ]);
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
  // As the database after manual-sql/0009 (0010 drops the first).
  fakeDb.unique("qrCode", "slug");
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.unique("qrCode", "domainId", "slug");
  fakeDb.seed("user", [
    { id: "u_alice", banned: false, banExpires: null },
    { id: "u_bob", banned: false, banExpires: null },
    { id: "u_carol", banned: false, banExpires: null },
  ]);
  fakeDb.seed("oauthApp", [{ id: "app_1", isActive: true }]);
  fakeDb.seed("member", [
    { id: "m1", organizationId: "org_acme", userId: "u_alice", role: "owner" },
    { id: "m2", organizationId: "org_acme", userId: "u_bob", role: "member" },
    { id: "m3", organizationId: "org_acme", userId: "u_carol", role: "admin" },
  ]);
  grant("read-token", "u_alice", ["codes:read"]);
  grant("write-token", "u_alice", ["codes:write"]);
  grant("profile-token", "u_alice", ["profile:read"]);
  state.session = null;
  state.plan = "free";
  state.rateLimited = false;
  state.emitted = [];
  codeSeq = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Requests ───────────────────────────────────────────────────────────────

interface Call {
  token?: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}

function request(method: string, path: string, call: Call = {}) {
  const headers: Record<string, string> = { ...call.headers };
  if (call.token) headers.authorization = `Bearer ${call.token}`;
  let body: string | undefined;
  if (call.rawBody !== undefined) body = call.rawBody;
  else if (call.body !== undefined) {
    body = JSON.stringify(call.body);
    headers["content-type"] ??= "application/json";
  }
  return new NextRequest(new URL(path, ORIGIN), { method, headers, body });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const getList = (query = "", call: Call = {}) =>
  list.GET(request("GET", `/api/v1/codes${query}`, call));
const create = (body: unknown, call: Call = {}) =>
  list.POST(request("POST", "/api/v1/codes", { body, ...call }));
const getOne = (id: string, call: Call = {}) =>
  one.GET(request("GET", `/api/v1/codes/${id}`, call), ctx(id));
const patch = (id: string, body: unknown, call: Call = {}) =>
  one.PATCH(
    request("PATCH", `/api/v1/codes/${id}`, { body, ...call }),
    ctx(id),
  );
const remove = (id: string, call: Call = {}) =>
  one.DELETE(request("DELETE", `/api/v1/codes/${id}`, call), ctx(id));

interface ApiError {
  code: string;
  message: string;
  status: number;
  docs?: string;
}
const errorOf = async (response: Response) =>
  (await response.json()) as ApiError;

const write = { token: "write-token" };
const read = { token: "read-token" };

// ─── Authentication and scopes ──────────────────────────────────────────────

describe("who may call /v1/codes", () => {
  it("lets codes:read tokens list and read, but not write", async () => {
    fakeDb.seed("qrCode", [code()]);
    expect((await getList("", read)).status).toBe(200);
    expect((await getOne("code_1", read)).status).toBe(200);

    const created = await create(
      { destinationUrl: "https://example.com" },
      read,
    );
    expect(created.status).toBe(403);
    expect(await errorOf(created)).toEqual({
      code: "INSUFFICIENT_SCOPE",
      message:
        "This token needs the 'codes:write' scope. Add it to your app and ask for it when the user authorizes.",
      status: 403,
      docs: "http://localhost:3000/docs/developers/rest-api#endpoints",
    });
    expect((await patch("code_1", { title: "x" }, read)).status).toBe(403);
    expect((await remove("code_1", read)).status).toBe(403);
    expect(fakeDb.rows("qrCode")).toHaveLength(1);
  });

  it("lets codes:write do everything codes:read does", async () => {
    fakeDb.seed("qrCode", [code()]);
    expect((await getList("", write)).status).toBe(200);
    expect((await getOne("code_1", write)).status).toBe(200);
  });

  it("refuses tokens without a codes scope", async () => {
    const response = await getList("", { token: "profile-token" });
    expect(response.status).toBe(403);
    expect((await errorOf(response)).code).toBe("INSUFFICIENT_SCOPE");
  });

  it("refuses unknown, expired and revoked tokens with 401 INVALID_TOKEN", async () => {
    const unknown = await getList("", { token: "made-up" });
    expect(unknown.status).toBe(401);
    expect(unknown.headers.get("www-authenticate")).toBe(
      'Bearer realm="QRdx API", error="invalid_token"',
    );
    const body = await errorOf(unknown);
    expect(body.code).toBe("INVALID_TOKEN");
    expect(body.message).toMatch(/refresh token/);
    expect(body.docs).toBe(
      "http://localhost:3000/docs/developers/rest-api#get-an-access-token",
    );

    vi.setSystemTime(NOW.getTime() + HOUR + 1000);
    expect((await getList("", read)).status).toBe(401);

    vi.setSystemTime(NOW);
    const row = fakeDb.find("oauthToken", { id: "tok_read-token" });
    if (row) row.revokedAt = NOW;
    expect((await getList("", read)).status).toBe(401);
  });

  it("refuses anonymous callers with a 401 that says how to get a key", async () => {
    const response = await getList();
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="QRdx API"',
    );
    expect(await errorOf(response)).toEqual({
      code: "UNAUTHORIZED",
      message:
        'Missing API key. Send an API key as "Authorization: Bearer <key>"; create one at http://localhost:3000/dashboard?to=settings/developers. OAuth access tokens go in the same header.',
      status: 401,
      docs: "http://localhost:3000/docs/developers/api-keys",
    });
  });

  it("acts on the token owner's personal workspace only", async () => {
    fakeDb.seed("qrCode", [
      code({ title: "Mine" }),
      code({ title: "Team", organizationId: "org_acme" }),
      code({ title: "Bob's", userId: "u_bob" }),
    ]);
    const body = (await (await getList("", read)).json()) as {
      data: { title: string }[];
    };
    expect(body.data.map((c) => c.title)).toEqual(["Mine"]);
    // Another workspace's code looks exactly like a missing one.
    for (const id of ["code_2", "code_3"]) {
      const response = await getOne(id, read);
      expect(response.status).toBe(404);
      expect((await errorOf(response)).code).toBe("NOT_FOUND");
      expect((await patch(id, { title: "hijack" }, write)).status).toBe(404);
      expect((await remove(id, write)).status).toBe(404);
    }
    expect(fakeDb.find("qrCode", { id: "code_3" })?.title).toBe("Bob's");
  });

  it("accepts the browser session, acting on the open team", async () => {
    fakeDb.seed("qrCode", [
      code({ title: "Personal" }),
      code({ title: "Team", organizationId: "org_acme", userId: "u_bob" }),
    ]);
    state.session = { userId: "u_alice", organizationId: "org_acme" };
    const body = (await (await getList()).json()) as {
      data: { title: string }[];
    };
    expect(body.data.map((c) => c.title)).toEqual(["Team"]);
  });

  it("falls back to the personal workspace when the session's team was left", async () => {
    fakeDb.seed("qrCode", [
      code({ title: "Personal", userId: "u_bob" }),
      code({ title: "Team", organizationId: "org_acme" }),
    ]);
    state.session = { userId: "u_bob", organizationId: "org_gone" };
    const body = (await (await getList()).json()) as {
      data: { title: string }[];
    };
    expect(body.data.map((c) => c.title)).toEqual(["Personal"]);
  });

  it("rejects cross-site session writes (CSRF) but allows same-origin ones", async () => {
    state.session = { userId: "u_alice", organizationId: null };
    const crossSite = await create(
      { destinationUrl: "https://example.com" },
      { headers: { origin: "https://evil.example" } },
    );
    expect(crossSite.status).toBe(403);
    expect((await errorOf(crossSite)).code).toBe("FORBIDDEN");
    expect(
      (
        await create(
          { destinationUrl: "https://example.com" },
          { headers: { origin: "null" } },
        )
      ).status,
    ).toBe(403);
    expect(fakeDb.rows("qrCode")).toHaveLength(0);

    const sameOrigin = await create(
      { destinationUrl: "https://example.com" },
      { headers: { origin: ORIGIN } },
    );
    expect(sameOrigin.status).toBe(201);
  });

  it("answers 429 RATE_LIMITED with Retry-After", async () => {
    state.rateLimited = true;
    const response = await getList("", read);
    expect(response.status).toBe(429);
    expect((await errorOf(response)).code).toBe("RATE_LIMITED");
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

// ─── Listing ────────────────────────────────────────────────────────────────

describe("GET /v1/codes", () => {
  it("returns the public code shape, newest first, uncached", async () => {
    fakeDb.seed("qrCode", [code(), code({ scanCount: 7 })]);
    const response = await getList("", read);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      data: Record<string, unknown>[];
      pagination: unknown;
    };
    expect(body.pagination).toEqual({ total: 2, limit: 50, offset: 0 });
    expect(body.data.map((c) => c.id)).toEqual(["code_1", "code_2"]);
    expect(Object.keys(body.data[0] ?? {}).sort()).toEqual(
      [
        "archivedAt",
        "contentType",
        "createdAt",
        "defaultShortLink",
        "destinationUrl",
        "domain",
        "id",
        "kind",
        "lastScannedAt",
        "organizationId",
        "pageId",
        "scanCount",
        "shortLink",
        "slug",
        "status",
        "style",
        "title",
        "updatedAt",
      ].sort(),
    );
    expect(body.data[0]).toMatchObject({
      slug: "Code001",
      shortLink: `${ORIGIN}/q/Code001`,
      defaultShortLink: `${ORIGIN}/q/Code001`,
      domain: null,
      status: "active",
      createdAt: new Date(NOW.getTime() - 1000).toISOString(),
    });
    expect(body.data[1]?.scanCount).toBe(7);
  });

  it("filters by status: active by default, archived, all; never the trash", async () => {
    fakeDb.seed("qrCode", [
      code({ title: "Live" }),
      code({ title: "Shelved", archivedAt: NOW }),
      code({ title: "Binned", deletedAt: NOW }),
    ]);
    const titles = async (query: string) =>
      (
        (await (await getList(query, read)).json()) as {
          data: { title: string; status: string }[];
        }
      ).data.map((c) => `${c.title}:${c.status}`);
    expect(await titles("")).toEqual(["Live:active"]);
    expect(await titles("?status=archived")).toEqual(["Shelved:archived"]);
    expect(await titles("?status=all")).toEqual([
      "Live:active",
      "Shelved:archived",
    ]);
    expect((await getList("?status=trash", read)).status).toBe(400);
  });

  it("searches titles and destinations, and finds a pasted short link", async () => {
    fakeDb.seed("qrCode", [
      code({
        title: "Spring menu",
        destinationUrl: "https://cafe.example/menu",
      }),
      code({ title: "Wifi", destinationUrl: "https://cafe.example/wifi" }),
      code({ title: "100% off_sale" }),
    ]);
    const titles = async (q: string) =>
      (
        (await (await getList(`?q=${encodeURIComponent(q)}`, read)).json()) as {
          data: { title: string }[];
        }
      ).data.map((c) => c.title);
    expect(await titles("MENU")).toEqual(["Spring menu"]);
    expect(await titles("cafe.example")).toEqual(["Spring menu", "Wifi"]);
    expect(await titles(`${ORIGIN}/q/Code002`)).toEqual(["Wifi"]);
    // LIKE wildcards in the query are literal characters.
    expect(await titles("100%")).toEqual(["100% off_sale"]);
    expect(await titles("%")).toEqual(["100% off_sale"]);
    expect(await titles("_")).toEqual(["100% off_sale"]);
  });

  it("pages with limit and offset, and validates them", async () => {
    fakeDb.seed(
      "qrCode",
      Array.from({ length: 5 }, () => code()),
    );
    const body = (await (await getList("?limit=2&offset=2", read)).json()) as {
      data: { id: string }[];
      pagination: unknown;
    };
    expect(body.data.map((c) => c.id)).toEqual(["code_3", "code_4"]);
    expect(body.pagination).toEqual({ total: 5, limit: 2, offset: 2 });
    for (const bad of ["?limit=0", "?limit=101", "?offset=-1", "?limit=abc"]) {
      const response = await getList(bad, read);
      expect(response.status, bad).toBe(400);
      expect((await errorOf(response)).code).toBe("VALIDATION_ERROR");
    }
  });
});

// ─── Creating ───────────────────────────────────────────────────────────────

describe("POST /v1/codes", () => {
  it("creates an active code with a fresh 7-character short link", async () => {
    const response = await create(
      {
        destinationUrl: "  https://example.com/launch?utm=1  ",
        title: "Launch",
      },
      write,
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { data } = (await response.json()) as {
      data: Record<string, unknown>;
    };
    expect(data).toMatchObject({
      destinationUrl: "https://example.com/launch?utm=1",
      title: "Launch",
      status: "active",
      scanCount: 0,
      // An OAuth token acts on its user's own workspace.
      organizationId: ownWorkspaceId("u_alice"),
      archivedAt: null,
    });
    expect(data.slug).toMatch(/^[0-9A-Za-z]{7}$/);
    expect(data.shortLink).toBe(`${ORIGIN}/q/${data.slug}`);
    expect(fakeDb.find("qrCode", { id: data.id })).toMatchObject({
      userId: "u_alice",
      organizationId: ownWorkspaceId("u_alice"),
    });
    expect(state.emitted).toEqual([{ event: "code.created", ids: [data.id] }]);
  });

  const INVALID_DESTINATIONS: [string, string][] = [
    ["", "Enter a destination URL"],
    ["example.com", "Enter a full URL, starting with https://"],
    ["javascript:alert(1)", "Only http:// and https:// links can be used"],
    ["ftp://example.com/file", "Only http:// and https:// links can be used"],
    [
      "https://user:pass@example.com",
      "Links with a username or password are not allowed",
    ],
    [
      `${ORIGIN}/q/AbC1234`,
      "A dynamic code cannot point to another QRdx short link",
    ],
    [
      `https://example.com/${"a".repeat(2050)}`,
      "The destination URL is too long",
    ],
  ];

  const validationMessages = async (response: Response) =>
    (
      (await response.json()) as {
        code: string;
        data: { details: { message: string }[] };
      }
    ).data.details.map((detail) => detail.message);

  it("rejects unusable destinations with 400 VALIDATION_ERROR", async () => {
    for (const [destinationUrl] of INVALID_DESTINATIONS) {
      const response = await create({ destinationUrl }, write);
      expect(response.status, destinationUrl).toBe(400);
      expect((await errorOf(response)).code).toBe("VALIDATION_ERROR");
    }
    const longTitle = await create(
      { destinationUrl: "https://example.com", title: "x".repeat(101) },
      write,
    );
    expect(longTitle.status).toBe(400);
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("explains invalid destinations in bulk requests", async () => {
    state.plan = "pro";
    for (const [destinationUrl, message] of INVALID_DESTINATIONS) {
      const response = await create([{ destinationUrl }], write);
      expect(await validationMessages(response), destinationUrl).toContain(
        message,
      );
    }
  });

  it("explains invalid destinations in single-code requests", async () => {
    for (const [destinationUrl, message] of INVALID_DESTINATIONS) {
      const response = await create({ destinationUrl }, write);
      expect(await validationMessages(response), destinationUrl).toContain(
        message,
      );
    }
  });

  it("takes JSON only", async () => {
    const form = await list.POST(
      request("POST", "/api/v1/codes", {
        ...write,
        rawBody: "destinationUrl=https://example.com",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );
    expect(form.status).toBe(415);
    expect((await errorOf(form)).code).toBe("UNSUPPORTED_MEDIA_TYPE");
    const broken = await list.POST(
      request("POST", "/api/v1/codes", {
        ...write,
        rawBody: "{not json",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(broken.status).toBe(400);
  });

  it("caps request bodies at 4 MB (413)", async () => {
    const response = await list.POST(
      request("POST", "/api/v1/codes", {
        ...write,
        rawBody: JSON.stringify({
          destinationUrl: "https://example.com",
          title: "x".repeat(4 * 1024 * 1024),
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("creates in bulk on Pro, keeping the request's order", async () => {
    state.plan = "pro";
    const urls = Array.from(
      { length: 5 },
      (_, i) => `https://example.com/${i}`,
    );
    const response = await create(
      urls.map((destinationUrl) => ({ destinationUrl })),
      write,
    );
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as {
      data: { destinationUrl: string; slug: string }[];
    };
    expect(data.map((c) => c.destinationUrl)).toEqual(urls);
    expect(new Set(data.map((c) => c.slug)).size).toBe(5);
  });

  it("needs Pro for bulk creation (402 PLAN_REQUIRED)", async () => {
    const response = await create(
      [
        { destinationUrl: "https://a.example" },
        { destinationUrl: "https://b.example" },
      ],
      write,
    );
    expect(response.status).toBe(402);
    expect((await errorOf(response)).code).toBe("PLAN_REQUIRED");
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
    // An array of one is not bulk.
    expect(
      (await create([{ destinationUrl: "https://a.example" }], write)).status,
    ).toBe(201);
  });

  it("takes at most 100 codes per request", async () => {
    state.plan = "business";
    const response = await create(
      Array.from({ length: 101 }, () => ({
        destinationUrl: "https://example.com",
      })),
      write,
    );
    expect(response.status).toBe(400);
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });
});

// ─── Plan limits ────────────────────────────────────────────────────────────

describe("the Free plan's 10 active codes", () => {
  const fill = (count: number, overrides: Record<string, unknown> = {}) =>
    fakeDb.seed(
      "qrCode",
      Array.from({ length: count }, () => code(overrides)),
    );

  it("blocks the 11th active code with 402 LIMIT_REACHED", async () => {
    fill(9);
    expect(
      (await create({ destinationUrl: "https://example.com/10" }, write))
        .status,
    ).toBe(201);
    const response = await create(
      { destinationUrl: "https://example.com/11" },
      write,
    );
    expect(response.status).toBe(402);
    expect(await errorOf(response)).toMatchObject({
      code: "LIMIT_REACHED",
      message: expect.stringContaining("10 active dynamic QR codes"),
    });
    expect(fakeDb.rows("qrCode")).toHaveLength(10);
  });

  it("doesn't count archived or trashed codes, or other workspaces' codes", async () => {
    fill(5, { archivedAt: NOW });
    fill(3, { deletedAt: NOW });
    fill(9);
    fill(10, { organizationId: "org_acme" });
    fill(10, { userId: "u_bob" });
    expect(
      (await create({ destinationUrl: "https://example.com" }, write)).status,
    ).toBe(201);
  });

  it("archiving frees a slot, and unarchiving needs one", async () => {
    fill(10);
    expect(
      (await create({ destinationUrl: "https://example.com" }, write)).status,
    ).toBe(402);

    const archived = await patch("code_1", { archived: true }, write);
    expect(archived.status).toBe(200);
    const { data } = (await archived.json()) as {
      data: { status: string; archivedAt: string };
    };
    expect(data.status).toBe("archived");
    expect(data.archivedAt).toBe(NOW.toISOString());

    expect(
      (await create({ destinationUrl: "https://example.com" }, write)).status,
    ).toBe(201);

    const unarchive = await patch("code_1", { archived: false }, write);
    expect(unarchive.status).toBe(402);
    expect((await errorOf(unarchive)).code).toBe("LIMIT_REACHED");
    expect(fakeDb.find("qrCode", { id: "code_1" })?.archivedAt).toEqual(NOW);
  });

  it("keeps every existing code editable over the limit (Never-Hostage)", async () => {
    fill(12); // e.g. after a downgrade from Pro
    const response = await patch(
      "code_1",
      { destinationUrl: "https://example.com/new", title: "Renamed" },
      write,
    );
    expect(response.status).toBe(200);
    expect(fakeDb.find("qrCode", { id: "code_1" })).toMatchObject({
      destinationUrl: "https://example.com/new",
      title: "Renamed",
    });
    expect((await patch("code_2", { archived: true }, write)).status).toBe(200);
  });

  it("is unlimited on Pro", async () => {
    state.plan = "pro";
    fill(250);
    expect(
      (await create({ destinationUrl: "https://example.com" }, write)).status,
    ).toBe(201);
  });
});

// ─── Updating and deleting ──────────────────────────────────────────────────

describe("PATCH and DELETE /v1/codes/{id}", () => {
  it("updates the destination and reports what changed", async () => {
    fakeDb.seed("qrCode", [code()]);
    const response = await patch(
      "code_1",
      { destinationUrl: "https://example.com/b" },
      write,
    );
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { destinationUrl: string; slug: string };
    };
    expect(data.destinationUrl).toBe("https://example.com/b");
    // The short link (what is printed) never changes.
    expect(data.slug).toBe("Code001");
    expect(state.emitted).toEqual([{ event: "code.updated", ids: ["code_1"] }]);
  });

  it("clears a title with null and rejects empty patches", async () => {
    fakeDb.seed("qrCode", [code()]);
    const cleared = await patch("code_1", { title: null }, write);
    expect(
      ((await cleared.json()) as { data: { title: null } }).data.title,
    ).toBeNull();
    const empty = await patch("code_1", {}, write);
    expect(empty.status).toBe(400);
    expect((await errorOf(empty)).code).toBe("VALIDATION_ERROR");
  });

  it("deletes a code: it is gone afterwards", async () => {
    fakeDb.seed("qrCode", [code()]);
    const response = await remove("code_1", write);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { id: "code_1", deleted: true },
    });
    expect((await getOne("code_1", write)).status).toBe(404);
    expect((await remove("code_1", write)).status).toBe(404);
  });

  it("lets team members delete only their own codes; owners and admins any", async () => {
    fakeDb.seed("qrCode", [
      code({ organizationId: "org_acme", userId: "u_alice" }),
      code({ organizationId: "org_acme", userId: "u_bob" }),
      code({ organizationId: "org_acme", userId: "u_alice" }),
    ]);
    const as = (userId: string) => {
      state.session = { userId, organizationId: "org_acme" };
      return { headers: { origin: ORIGIN } };
    };

    const denied = await remove("code_1", as("u_bob"));
    expect(denied.status).toBe(403);
    expect((await errorOf(denied)).code).toBe("FORBIDDEN");
    expect((await remove("code_2", as("u_bob"))).status).toBe(200);
    expect((await remove("code_3", as("u_carol"))).status).toBe(200);
    expect(fakeDb.rows("qrCode").map((r) => r.id)).toEqual(["code_1"]);
  });

  it("rejects ids that can't be code ids", async () => {
    const response = await getOne("x".repeat(65), read);
    expect(response.status).toBe(400);
  });
});

// ─── Logos in a code's style ────────────────────────────────────────────────

describe("logos in a code's style", () => {
  const ownFile = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    userId: "u_alice",
    organizationId: ownWorkspaceId("u_alice"),
    filename: "logo.png",
    mime: "image/png",
    size: 2048,
    status: "ready",
    storageKey: `files/u-alice/${id}.png`,
    createdAt: NOW,
    ...overrides,
  });

  it("takes an uploaded logo by file id and keeps its link", async () => {
    fakeDb.seed("fileAsset", [ownFile("cm5logo0brand0mark000001")]);
    const response = await create(
      {
        destinationUrl: "https://example.com/logo",
        style: { fgColor: "#111111", logoFileId: "cm5logo0brand0mark000001" },
      },
      write,
    );
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.style).toEqual({
      fgColor: "#111111",
      showLogo: true,
      customLogo: `${ORIGIN}/api/files/cm5logo0brand0mark000001`,
    });
  });

  it("refuses a file of another workspace, a file that isn't an image, and logos from other sites", async () => {
    fakeDb.seed("fileAsset", [
      ownFile("cm5bob0logo0000000000001", {
        userId: "u_bob",
        organizationId: ownWorkspaceId("u_bob"),
      }),
      ownFile("cm5alice0menu0pdf0000001", { mime: "application/pdf" }),
    ]);
    const other = await create(
      {
        destinationUrl: "https://example.com",
        style: { logoFileId: "cm5bob0logo0000000000001" },
      },
      write,
    );
    expect(other.status).toBe(404);
    const pdf = await create(
      {
        destinationUrl: "https://example.com",
        style: { logoFileId: "cm5alice0menu0pdf0000001" },
      },
      write,
    );
    expect(pdf.status).toBe(400);
    const remote = await create(
      {
        destinationUrl: "https://example.com",
        style: { customLogo: "https://tracker.example/pixel.png" },
      },
      write,
    );
    expect(remote.status).toBe(400);
    expect(JSON.stringify(await remote.json())).toContain("logoFileId");
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("takes a quick logo icon and image data URLs as the editor saves them", async () => {
    const icon = await create(
      { destinationUrl: "https://example.com", style: { logoIcon: "wifi" } },
      write,
    );
    expect(icon.status).toBe(201);
    expect((await icon.json()).data.style).toMatchObject({
      showLogo: true,
      customLogo: expect.stringContaining("data-qrdx-icon%3D%22wifi%22"),
    });
    const dataUrl = await create(
      {
        destinationUrl: "https://example.com",
        style: { showLogo: true, customLogo: "data:image/png;base64,iVBORw0K" },
      },
      write,
    );
    expect(dataUrl.status).toBe(201);
  });

  it("lets a PATCH send back the logo the code already has", async () => {
    fakeDb.seed("qrCode", [
      code({
        style: { showLogo: true, customLogo: "https://cdn.example/old.png" },
      }),
    ]);
    const same = await patch(
      "code_1",
      {
        style: {
          fgColor: "#222222",
          showLogo: true,
          customLogo: "https://cdn.example/old.png",
        },
      },
      write,
    );
    expect(same.status).toBe(200);
    const changed = await patch(
      "code_1",
      { style: { customLogo: "https://cdn.example/new.png" } },
      write,
    );
    expect(changed.status).toBe(400);
  });
});

// Image fills in a saved style hold the picture itself, as a data:image URL
// (lib/paint/saved-paint.ts), like logos: a picture from a link would load
// in every viewer's browser. All six paint slots, the REST API, the
// builder's save and the theme save.
describe("image fills in a code's style", () => {
  const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==";
  const fill = (src: string) => ({
    type: "image",
    src,
    fit: "cover",
    scale: 1,
    position: "center",
    opacity: 0.5,
    underlay: "#000000",
  });
  const refusals = async (response: Response) => {
    expect(response.status).toBe(400);
    return JSON.stringify(await response.json());
  };

  it("refuses a picture from a link with the reason", async () => {
    const body = await refusals(
      await create(
        {
          destinationUrl: "https://example.com",
          style: { fgColor: fill("https://tracker.example/pixel.png") },
        },
        write,
      ),
    );
    expect(body).toContain(
      "Image fills must be a data:image URL (PNG, JPEG, WebP or GIF); pictures from links aren't accepted.",
    );
    expect(body).toContain("style.fgColor.src");
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("refuses SVG, blob and relative pictures, and one per eye", async () => {
    for (const src of [
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "data:image/png,not-base64",
      "blob:https://qrdx.dev/0b6a",
      "/images/art-samples/photos/dog.webp",
    ]) {
      await refusals(
        await create(
          {
            destinationUrl: "https://example.com",
            style: { bgColor: fill(src) },
          },
          write,
        ),
      );
    }
    const eye = await refusals(
      await create(
        {
          destinationUrl: "https://example.com",
          style: {
            eyeColors: {
              topLeft: { outer: fill("https://tracker.example/eye.png") },
            },
          },
        },
        write,
      ),
    );
    expect(eye).toContain("style.eyeColors.topLeft.outer.src");
    expect(fakeDb.rows("qrCode")).toHaveLength(0);
  });

  it("refuses a picture over 1.5 MB", async () => {
    const big = `data:image/jpeg;base64,${"A".repeat(1_500_000)}`;
    const body = await refusals(
      await create(
        {
          destinationUrl: "https://example.com",
          style: { dotColor: fill(big) },
        },
        write,
      ),
    );
    expect(body).toContain("too large to save");
  });

  it("takes a data:image picture, on create and on PATCH", async () => {
    const created = await create(
      {
        destinationUrl: "https://example.com",
        style: { fgColor: fill(JPEG), eyeColor: fill(JPEG) },
      },
      write,
    );
    expect(created.status).toBe(201);
    const { data } = await created.json();
    expect(data.style.fgColor).toEqual(fill(JPEG));

    const row = code({ organizationId: ownWorkspaceId("u_alice") });
    fakeDb.seed("qrCode", [row]);
    const remote = await patch(
      row.id as string,
      { style: { bgColor: fill("https://cdn.example/bg.jpg") } },
      write,
    );
    expect(await refusals(remote)).toContain("style.bgColor.src");
    const ok = await patch(
      row.id as string,
      { style: { bgColor: fill(JPEG) } },
      write,
    );
    expect(ok.status).toBe(200);
  });

  it("refuses a picture from a link in the builder's and the theme's saves", async () => {
    state.session = { userId: "u_alice", organizationId: null };
    const qrCodes = await import("@/actions/qr-codes");
    const saved = await qrCodes.createQrCode({
      destinationUrl: "https://example.com",
      style: { fgColor: fill("https://tracker.example/pixel.png") },
    } as never);
    expect(saved).toMatchObject({ success: false });
    expect(JSON.stringify(saved)).toContain("data:image URL");
    expect(fakeDb.rows("qrCode")).toHaveLength(0);

    const themes = await import("@/actions/qr-themes");
    const theme = themes.createTheme({
      name: "E2E remote picture",
      style: {
        eyeColors: {
          bottomLeft: { inner: fill("https://tracker.example/eye.png") },
        },
      } as never,
    });
    await expect(theme).rejects.toMatchObject({ message: "Invalid input" });
    await theme.catch((error: { details?: unknown }) => {
      expect(JSON.stringify(error.details)).toContain(
        "pictures from links aren't accepted",
      );
    });
    expect(fakeDb.rows("qrPreset")).toHaveLength(0);
  });
});

describe("a code's content type", () => {
  const WHATSAPP =
    "https://wa.me/14155550132?text=Hi%2C%20I%20want%20to%20book";
  const dataOf = async (response: Response) =>
    ((await response.json()) as { data: { id: string; contentType: string } })
      .data;

  it("stores a WhatsApp chat link as a whatsapp code", async () => {
    const response = await create({ destinationUrl: WHATSAPP }, write);
    expect(response.status).toBe(201);
    const data = await dataOf(response);
    expect(data.contentType).toBe("whatsapp");
    expect(fakeDb.find("qrCode", { id: data.id })?.contentType).toBe(
      "whatsapp",
    );
  });

  it("keeps other links as url codes", async () => {
    for (const destinationUrl of [
      "https://example.com/menu",
      "https://chat.whatsapp.com/AbCdEfGh123",
      "https://example.com/wa.me/123",
    ]) {
      const data = await dataOf(await create({ destinationUrl }, write));
      expect(data.contentType, destinationUrl).toBe("url");
    }
  });

  it("follows the destination when a PATCH changes it", async () => {
    fakeDb.seed("qrCode", [code()]);
    const toChat = await dataOf(
      await patch("code_1", { destinationUrl: WHATSAPP }, write),
    );
    expect(toChat.contentType).toBe("whatsapp");
    const back = await dataOf(
      await patch("code_1", { destinationUrl: "https://example.com" }, write),
    );
    expect(back.contentType).toBe("url");
  });

  it("leaves any other content type alone", async () => {
    fakeDb.seed("qrCode", [code({ contentType: "maps" })]);
    await patch(
      "code_1",
      {
        destinationUrl: "https://www.google.com/maps/search/?api=1&query=cafe",
      },
      write,
    );
    expect(fakeDb.find("qrCode", { id: "code_1" })?.contentType).toBe("maps");
  });
});
