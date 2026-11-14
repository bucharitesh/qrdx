// Repeated visits to one referral link (app/r/[code]/route.ts) from one IP
// stop counting after 20 a minute, like repeated scans of one code: the
// link keeps going on with the code, but the affiliate's visit count, a
// database write, stops going up. Other links and other addresses keep
// their own counts. The limiter is the package's in-memory window.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ keys: [] as string[] }));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: (id: string) => id === "affiliates",
}));
vi.mock("@repo/rate-limit", async () => {
  const { createMemoryLimiter, parseDuration } = await import(
    "@repo/rate-limit/fallback"
  );
  return {
    slidingWindow: (tokens: number, window: string) => ({
      tokens,
      windowMs: parseDuration(window),
    }),
    createRateLimiter: ({
      limiter,
    }: {
      limiter: { tokens: number; windowMs: number };
    }) => {
      const memory = createMemoryLimiter(limiter);
      return {
        limit: async (key: string) => {
          state.keys.push(key);
          return memory.limit(key);
        },
      };
    },
  };
});

import { GET as referralLink } from "@/app/r/[code]/route";
import { fakeDb } from "../support/fake-db";
import { resetAffiliateDb, seedAffiliate } from "./seed";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

const open = (code: string, ip: string, userAgent = BROWSER) =>
  referralLink(
    new Request(`http://localhost:3000/r/${code}`, {
      headers: { "user-agent": userAgent, "x-real-ip": ip },
    }),
    { params: Promise.resolve({ code }) },
  );

const clicks = (id: string) => fakeDb.find("affiliate", { id })?.clickCount;

beforeEach(() => {
  resetAffiliateDb();
  state.keys = [];
  seedAffiliate();
  seedAffiliate({ id: "aff_2", userId: "user_x", code: "ben-okafor-7m3q" });
});

describe("the referral link's visit count", () => {
  it("stops counting one address after 20 visits a minute, and the link keeps working", async () => {
    const ip = freshIp();
    for (let i = 0; i < 20; i++) await open("ana-diaz-4k2p", ip);
    expect(clicks("aff_1")).toBe(20);

    const over = await open("ana-diaz-4k2p", ip);
    expect(over.status).toBe(307);
    expect(over.headers.get("location")).toBe("/?ref=ana-diaz-4k2p");
    expect(clicks("aff_1")).toBe(20);

    // Another address, and another link from the same one, still count.
    await open("ana-diaz-4k2p", freshIp());
    expect(clicks("aff_1")).toBe(21);
    await open("ben-okafor-7m3q", ip);
    expect(clicks("aff_2")).toBe(1);
  });

  it("doesn't spend the limit on bots", async () => {
    await open(
      "ana-diaz-4k2p",
      freshIp(),
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
    );
    expect(state.keys).toEqual([]);
    expect(clicks("aff_1")).toBe(0);
  });
});
