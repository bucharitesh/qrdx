// Public analytics pages (/stats/<token>, lib/public-stats.ts) never show
// precise scan locations (lib/scan-location), whatever lib/scans returns:
// they stay country-level, even for a code on Pro that asks scanners for
// their location and has shared points.
import { describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

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
  getPlanForScope: async () => "pro",
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));
const POINT = { latitude: 52.517, longitude: 13.389 };
vi.mock("@/lib/scans", () => ({
  // As if analytics carried precise points: the page must still drop them.
  getScanAnalytics: async (_codeId: string, days: number) => ({
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
    preciseLocations: {
      asked: 12,
      shared: 5,
      points: [{ ...POINT, count: 5, accuracyM: 12 }],
    },
  }),
  getPreciseLocations: async () => ({
    asked: 12,
    shared: 5,
    points: [{ ...POINT, count: 5, accuracyM: 12, lastScannedAt: new Date() }],
  }),
}));

const { enablePublicStats, loadPublicStats } = await import(
  "@/lib/public-stats"
);

describe("public analytics pages", () => {
  it("never carry precise scan points, nothing finer than a country", async () => {
    fakeDb.resetAll();
    fakeDb.seed("qrCode", [
      {
        id: "c_menu",
        userId: "u_alice",
        organizationId: "org_acme",
        title: "Spring menu",
        slug: "spring-menu",
        slugScope: "",
        destinationUrl: "https://cafe.example/menu",
        domainId: null,
        isActive: true,
        deletedAt: null,
        pixels: { consent: "auto", conversions: false, preciseLocation: true },
        createdAt: new Date("2026-10-01T00:00:00Z"),
      },
    ]);
    const share = await enablePublicStats(
      { userId: "u_alice", organizationId: "org_acme", role: "owner" },
      "c_menu",
    );
    const stats = await loadPublicStats(
      share.url?.split("/stats/")[1] ?? "",
      "30d",
    );
    expect(stats).not.toBeNull();
    const text = JSON.stringify(stats);
    for (const leak of [
      "latitude",
      "longitude",
      "preciseLocation",
      String(POINT.latitude),
      String(POINT.longitude),
      "Berlin",
    ]) {
      expect(text).not.toContain(leak);
    }
  });
});
