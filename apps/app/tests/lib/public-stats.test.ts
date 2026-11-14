// Public analytics pages (lib/public-stats.ts): owners and editors turn one
// on per code; the page shows aggregates only (no destination path or query,
// nothing finer than country, no visitor data); turning it off or resetting
// the link applies at once; a trashed or admin-disabled code has none; and
// before manual-sql/0016 sharing says "unavailable" and links are 404s.
// In-memory tables (tests/support/fake-db); nothing touches a database.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, repoDatabase } from "../support/fake-db";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => "free",
}));
// The cache is Next's; the aggregates are faked (lib/scans has its own tests).
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));
const analytics = vi.hoisted(() => ({ calls: [] as [string, number][] }));
vi.mock("@/lib/scans", () => ({
  getScanAnalytics: async (codeId: string, days: number) => {
    analytics.calls.push([codeId, days]);
    return {
      from: new Date(),
      days,
      total: 12,
      unique: 9,
      series: [{ date: "2026-11-04", count: 12 }],
      countries: [{ value: "DE", count: 8 }],
      cities: [{ city: "Berlin", country: "DE", count: 8 }],
      devices: [{ value: "mobile", count: 11 }],
      os: [{ value: "iOS", count: 7 }],
      browsers: [{ value: "Safari", count: 7 }],
      referrers: [{ value: "instagram.com", count: 2 }],
      sources: { qr: 11, nfc: 1 },
    };
  },
}));

const {
  disablePublicStats,
  enablePublicStats,
  getPublicStatsShare,
  loadPublicStats,
  resetPublicStats,
  TOKEN_PATTERN,
} = await import("@/lib/public-stats");
const { parsePublicStatsRange } = await import("@/lib/public-stats-shared");

const owner = {
  userId: "u_alice",
  organizationId: "org_acme",
  role: "owner" as const,
};
const member = {
  userId: "u_bob",
  organizationId: "org_acme",
  role: "member" as const,
};
const viewer = {
  userId: "u_vic",
  organizationId: "org_acme",
  role: "viewer" as never,
};
const outsider = {
  userId: "u_eve",
  organizationId: "org_evil",
  role: "owner" as const,
};

const tokenOf = (url: string | null) => url?.split("/stats/")[1] ?? "";

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("codePublicStats", "qrCodeId");
  fakeDb.unique("codePublicStats", "token");
  analytics.calls.length = 0;
  fakeDb.seed("qrCode", [
    {
      id: "c_menu",
      userId: "u_alice",
      organizationId: "org_acme",
      title: "Spring menu",
      slug: "spring-menu",
      slugScope: "",
      destinationUrl:
        "https://www.cafe-rosa.com/menu/private-path?email=ada@example.com",
      domainId: null,
      isActive: true,
      deletedAt: null,
      createdAt: new Date("2026-10-01T00:00:00Z"),
    },
  ]);
});

describe("sharing a code's analytics", () => {
  it("is off until turned on, then gives a long random link", async () => {
    expect(await getPublicStatsShare(owner, "c_menu")).toEqual({
      available: true,
      canManage: true,
      url: null,
      since: null,
    });
    const share = await enablePublicStats(member, "c_menu");
    expect(share.url).toMatch(/\/stats\/[A-Za-z0-9_-]{32}$/);
    expect(TOKEN_PATTERN.test(tokenOf(share.url))).toBe(true);
    // Turning it on again keeps the same link.
    expect((await enablePublicStats(owner, "c_menu")).url).toBe(share.url);
    expect(fakeDb.rows("codePublicStats")).toHaveLength(1);
  });

  it("shows aggregates only: no destination path or query, no cities or visitors", async () => {
    const share = await enablePublicStats(owner, "c_menu");
    const stats = await loadPublicStats(tokenOf(share.url), "30d");
    expect(stats?.code).toEqual({
      title: "Spring menu",
      shortLink: expect.stringContaining("/q/spring-menu"),
      destinationHost: "cafe-rosa.com",
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    expect(Object.keys(stats?.analytics ?? {}).sort()).toEqual([
      "countries",
      "days",
      "devices",
      "referrers",
      "series",
      // NFC (feat/nfc): QR scans and NFC taps, counts only
      "sources",
      "total",
      "unique",
    ]);
    const text = JSON.stringify(stats);
    expect(text).not.toContain("private-path");
    expect(text).not.toContain("ada@example.com");
    expect(text).not.toContain("Berlin");
  });

  it("keeps to ranges the plan retains", async () => {
    const share = await enablePublicStats(owner, "c_menu");
    const stats = await loadPublicStats(tokenOf(share.url), "90d");
    expect(stats?.ranges).toEqual(["7d", "30d", "90d"]);
    expect(analytics.calls.at(-1)).toEqual(["c_menu", 90]);
    expect(parsePublicStatsRange("365d")).toBe("30d");
    expect(parsePublicStatsRange(["7d"])).toBe("7d");
  });

  it("turns off and resets at once: old links stop working", async () => {
    const first = await enablePublicStats(owner, "c_menu");
    const reset = await resetPublicStats(owner, "c_menu");
    expect(reset.url).not.toBe(first.url);
    expect(await loadPublicStats(tokenOf(first.url), "30d")).toBeNull();
    expect(await loadPublicStats(tokenOf(reset.url), "30d")).not.toBeNull();

    expect((await disablePublicStats(member, "c_menu")).url).toBeNull();
    expect(await loadPublicStats(tokenOf(reset.url), "30d")).toBeNull();
    expect(fakeDb.rows("codePublicStats")).toHaveLength(0);
  });

  it("hides trashed and admin-disabled codes", async () => {
    const share = await enablePublicStats(owner, "c_menu");
    const code = fakeDb.find("qrCode", { id: "c_menu" }) as Record<
      string,
      unknown
    >;
    code.isActive = false;
    expect(await loadPublicStats(tokenOf(share.url), "30d")).toBeNull();
    code.isActive = true;
    code.deletedAt = new Date();
    expect(await loadPublicStats(tokenOf(share.url), "30d")).toBeNull();
  });

  it("lets only owners and editors share, and only their own workspace's codes", async () => {
    await expect(enablePublicStats(viewer, "c_menu")).rejects.toMatchObject({
      status: 403,
    });
    expect((await getPublicStatsShare(viewer, "c_menu")).canManage).toBe(false);
    await expect(enablePublicStats(outsider, "c_menu")).rejects.toMatchObject({
      status: 404,
    });
    await expect(getPublicStatsShare(outsider, "c_menu")).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("ignores malformed tokens without a query", async () => {
    const select = vi.spyOn(
      repoDatabase.database as { select: () => unknown },
      "select",
    );
    expect(await loadPublicStats("../../etc", "30d")).toBeNull();
    expect(await loadPublicStats("short", "30d")).toBeNull();
    expect(select).not.toHaveBeenCalled();
    select.mockRestore();
  });
});

describe("before the code_public_stats table exists", () => {
  it("says sharing isn't available, and links are 404s (never a 500)", async () => {
    const missing = Object.assign(new Error("Failed query"), {
      cause: Object.assign(
        new Error('relation "code_public_stats" does not exist'),
        { code: "42P01" },
      ),
    });
    const database = repoDatabase.database as {
      select: (...args: unknown[]) => { from: (table: unknown) => unknown };
      insert: () => unknown;
    };
    const realSelect = database.select.bind(database);
    // Code lookups work; anything reading code_public_stats fails.
    const select = vi.spyOn(database, "select").mockImplementation(((
      ...args: unknown[]
    ) => {
      const query = realSelect(...args);
      return {
        ...query,
        from(table: unknown) {
          if (table === repoDatabase.codePublicStats) throw missing;
          return query.from(table);
        },
      };
    }) as never);
    const insert = vi.spyOn(database, "insert").mockImplementation(() => {
      throw missing;
    });
    try {
      expect(await getPublicStatsShare(owner, "c_menu")).toMatchObject({
        available: false,
        url: null,
      });
      await expect(enablePublicStats(owner, "c_menu")).rejects.toMatchObject({
        status: 503,
        code: "UNAVAILABLE",
      });
      expect(await loadPublicStats("a".repeat(32), "30d")).toBeNull();
    } finally {
      select.mockRestore();
      insert.mockRestore();
    }
  });
});
