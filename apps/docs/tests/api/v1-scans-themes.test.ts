// GET /v1/codes/{id}/scans and GET /v1/themes as rest-api.mdx and
// plans-and-limits.mdx describe them: scan analytics for a code in the
// caller's workspace, clamped to the plan's analytics history (Free 90 days,
// Pro 3 years, Business unlimited), individual scans paged with `before`;
// saved themes for tokens with themes:read. Codes and tokens live in memory;
// the SQL aggregation itself (lib/scans getScanAnalytics/listScans) is
// replaced by a recorder, since it is Postgres-specific.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "free" as "free" | "pro" | "business",
  analyticsCalls: [] as { codeId: string; days: number }[],
  listCalls: [] as { codeId: string; before: Date | null; limit: number }[],
  scans: [] as { id: string; scannedAt: Date }[],
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
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
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
vi.mock("@/lib/scans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scans")>();
  return {
    ...actual,
    getScanAnalytics: async (codeId: string, days: number) => {
      state.analyticsCalls.push({ codeId, days });
      return {
        from: actual.rangeStart(days),
        days,
        total: 3,
        unique: 2,
        series: [],
        countries: [{ value: "DE", count: 3 }],
        cities: [],
        devices: [],
        os: [],
        browsers: [],
        referrers: [],
      };
    },
    listScans: async (
      codeId: string,
      options: { before: Date | null; limit: number },
    ) => {
      state.listCalls.push({ codeId, ...options });
      return state.scans
        .filter((scan) => !options.before || scan.scannedAt < options.before)
        .slice(0, options.limit);
    },
  };
});
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const scansRoute = await import("@/app/api/v1/codes/[id]/scans/route");
const themesRoute = await import("@/app/api/v1/themes/route");
const themeRoute = await import("@/app/api/v1/themes/[themeId]/route");

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-01T12:00:00Z");
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function grant(token: string, userId: string, scopes: string[]) {
  fakeDb.seed("oauthToken", [
    {
      id: `tok_${token}`,
      accessTokenHash: sha256(token),
      appId: "app_1",
      userId,
      scopes,
      accessTokenExpiresAt: new Date(NOW.getTime() + 3_600_000),
      revokedAt: null,
    },
  ]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  fakeDb.seed("user", [
    { id: "u_alice", banned: false, banExpires: null },
    { id: "u_bob", banned: false, banExpires: null },
  ]);
  fakeDb.seed("oauthApp", [{ id: "app_1", isActive: true }]);
  const base = {
    isActive: true,
    archivedAt: null,
    deletedAt: null,
    domainId: null,
    organizationId: null,
    kind: "redirect",
    pageId: null,
    title: null,
    contentType: "url",
    style: null,
    scanCount: 3,
    lastScannedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    destinationUrl: "https://example.com",
  };
  fakeDb.seed("qrCode", [
    { ...base, id: "code_alice", userId: "u_alice", slug: "Alice12" },
    { ...base, id: "code_bob", userId: "u_bob", slug: "Bobby12" },
    {
      ...base,
      id: "code_trash",
      userId: "u_alice",
      slug: "Trash12",
      deletedAt: NOW,
    },
  ]);
  fakeDb.seed("qrPreset", [
    {
      id: "th_1",
      userId: "u_alice",
      organizationId: null,
      name: "Brand",
      style: { fg: "#000" },
      isDefault: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: "th_2",
      userId: "u_bob",
      organizationId: null,
      name: "Bob's",
      style: { fg: "#111" },
      isDefault: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  grant("read", "u_alice", ["codes:read"]);
  grant("themes", "u_alice", ["themes:read"]);
  grant("profile", "u_alice", ["profile:read"]);
  state.plan = "free";
  state.analyticsCalls = [];
  state.listCalls = [];
  state.scans = [];
});

afterEach(() => {
  vi.useRealTimers();
});

const getScans = (id: string, query = "", token = "read") =>
  scansRoute.GET(
    new NextRequest(new URL(`/api/v1/codes/${id}/scans${query}`, ORIGIN), {
      headers: { authorization: `Bearer ${token}` },
    }),
    { params: Promise.resolve({ id }) },
  );

interface ScansBody {
  data: {
    codeId: string;
    range: string;
    retentionDays: number;
    total: number;
    from: string;
    events?: { id: string; scannedAt: string }[];
    nextBefore?: string | null;
  };
}

describe("GET /v1/codes/{id}/scans", () => {
  it("returns the code's analytics for the last 30 days by default", async () => {
    const response = await getScans("code_alice");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { data } = (await response.json()) as ScansBody;
    expect(data).toMatchObject({
      codeId: "code_alice",
      range: "30d",
      retentionDays: 90,
      total: 3,
    });
    expect(data.events).toBeUndefined();
    // The range starts at midnight UTC and includes today.
    expect(data.from).toBe("2026-10-03T00:00:00.000Z");
    expect(state.analyticsCalls).toEqual([{ codeId: "code_alice", days: 30 }]);
  });

  it.each([
    ["free", "365d", "30d", 90],
    ["free", "90d", "90d", 90],
    ["pro", "1095d", "1095d", 1095],
    ["business", "1095d", "1095d", Number.POSITIVE_INFINITY],
  ] as const)("on %s, asking for %s gives %s (history: %s days)", async (plan, asked, served, retention) => {
    state.plan = plan;
    const { data } = (await (
      await getScans("code_alice", `?range=${asked}`)
    ).json()) as ScansBody;
    expect(data.range).toBe(served);
    // JSON turns Infinity into null: "unlimited".
    expect(data.retentionDays).toBe(
      Number.isFinite(retention) ? retention : null,
    );
  });

  it("rejects unknown ranges", async () => {
    expect((await getScans("code_alice", "?range=10y")).status).toBe(400);
  });

  it("pages individual scans newest first with `before`", async () => {
    state.scans = [3, 2, 1].map((hour) => ({
      id: `scan_${hour}`,
      scannedAt: new Date(Date.UTC(2026, 10, 1, hour)),
    }));
    const first = (await (
      await getScans("code_alice", "?limit=2")
    ).json()) as ScansBody;
    expect(first.data.events?.map((e) => e.id)).toEqual(["scan_3", "scan_2"]);
    expect(first.data.nextBefore).toBe("2026-11-01T02:00:00.000Z");

    const second = (await (
      await getScans(
        "code_alice",
        `?limit=2&before=${encodeURIComponent(first.data.nextBefore as string)}`,
      )
    ).json()) as ScansBody;
    expect(second.data.events?.map((e) => e.id)).toEqual(["scan_1"]);
    expect(second.data.nextBefore).toBeNull();
  });

  it("validates limit and before", async () => {
    for (const query of ["?limit=501", "?limit=-1", "?before=yesterday"]) {
      expect((await getScans("code_alice", query)).status, query).toBe(400);
    }
  });

  it("only shows the caller's own, non-trashed codes", async () => {
    for (const id of ["code_bob", "code_trash", "nope"]) {
      const response = await getScans(id);
      expect(response.status, id).toBe(404);
    }
    expect(state.analyticsCalls).toEqual([]);
  });

  it("needs codes:read", async () => {
    const response = await getScans("code_alice", "", "themes");
    expect(response.status).toBe(403);
  });
});

describe("GET /v1/themes", () => {
  const getThemes = (token?: string) =>
    themesRoute.GET(
      new NextRequest(new URL("/api/v1/themes", ORIGIN), {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );
  const getTheme = (id: string, token = "themes") =>
    themeRoute.GET(
      new NextRequest(new URL(`/api/v1/themes/${id}`, ORIGIN), {
        headers: { authorization: `Bearer ${token}` },
      }),
      { params: Promise.resolve({ themeId: id }) },
    );

  it("lists the token owner's saved themes (name and style)", async () => {
    const response = await getThemes("themes");
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as {
      data: { id: string; name: string; style: unknown }[];
    };
    expect(data.map((theme) => theme.id)).toEqual(["th_1"]);
    expect(data[0]).toMatchObject({ name: "Brand", style: { fg: "#000" } });
  });

  it("returns one theme, and 404 for someone else's", async () => {
    expect((await getTheme("th_1")).status).toBe(200);
    const other = await getTheme("th_2");
    expect(other.status).toBe(404);
    expect(((await other.json()) as { error: string }).error).toBe("not_found");
  });

  it("needs themes:read, with OAuth-shaped errors", async () => {
    const wrongScope = await getThemes("profile");
    expect(wrongScope.status).toBe(403);
    expect(await wrongScope.json()).toEqual({
      error: "insufficient_scope",
      error_description: "Scope 'themes:read' required",
    });
    expect((await getThemes()).status).toBe(401);
  });
});
