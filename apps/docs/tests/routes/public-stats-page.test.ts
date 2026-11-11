// /stats/<token> metadata: never indexed or cached by search engines, never
// sends its link on as a referrer, and no social preview, found or not.
// The loader is mocked; nothing touches a database.
import { describe, expect, it, vi } from "vitest";

const found = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/public-stats", () => ({
  loadPublicStats: async () =>
    found.value
      ? {
          code: {
            title: "Spring menu",
            shortLink: "https://qrdx.dev/q/spring-menu",
            destinationHost: "cafe-rosa.com",
            createdAt: "2026-10-01T00:00:00.000Z",
          },
          range: "30d",
          ranges: ["7d", "30d", "90d"],
          analytics: {
            days: 30,
            total: 0,
            unique: 0,
            series: [],
            countries: [],
            devices: [],
            referrers: [],
          },
        }
      : null,
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
}));

const { generateMetadata } = await import("@/app/(app)/stats/[token]/page");

const props = {
  params: Promise.resolve({ token: "a".repeat(32) }),
  searchParams: Promise.resolve({}),
};

describe("/stats/<token> metadata", () => {
  it("is noindex, no-referrer and without a social preview", async () => {
    found.value = true;
    const metadata = await generateMetadata(props);
    expect(metadata.title).toBe("Spring menu: scan analytics");
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
      nocache: true,
    });
    expect(metadata.referrer).toBe("no-referrer");
    expect(metadata.openGraph).toBeNull();
    expect(metadata.twitter).toBeNull();
  });

  it("stays noindex for unknown or switched-off links", async () => {
    found.value = false;
    const metadata = await generateMetadata(props);
    expect(metadata.title).toBe("Not found");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.referrer).toBe("no-referrer");
  });
});
