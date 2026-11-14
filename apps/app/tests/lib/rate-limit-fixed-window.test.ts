// @repo/rate-limit's fixedWindow (the daily REST API quota, lib/api-quota):
// the real createRateLimiter and @upstash/ratelimit run against an in-memory
// stand-in for the Upstash REST client, so nothing touches the network. Also
// covers an Upstash outage: the in-memory fallback must enforce the same
// tokens with a fixed window, not the 10-per-10-seconds default or a sliding
// window that carries yesterday's count into today.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const upstash = vi.hoisted(() => {
  // Credentials make createRateLimiter use "Upstash" instead of a no-op.
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://upstash.test.invalid");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
  return { down: false, calls: 0, store: new Map<string, number>() };
});

// Upstash's fixed-window script: INCRBY the window's key, return the count
// and the limit.
vi.mock("../../../../packages/rate-limit/node_modules/@upstash/redis", () => ({
  Redis: class {
    async evalsha(_sha: string, keys: string[], args: unknown[]) {
      upstash.calls++;
      if (upstash.down) throw new Error("fetch failed");
      const [tokens, , incrementBy] = args.map(Number);
      const used = (upstash.store.get(keys[0]) ?? 0) + incrementBy;
      upstash.store.set(keys[0], used);
      return [used, tokens];
    }
    eval(_script: string, keys: string[], args: unknown[]) {
      return this.evalsha("", keys, args);
    }
  },
}));

const { createRateLimiter, fixedWindow } = await import("@repo/rate-limit");

const DAY = 86_400_000;
const NOON = new Date("2026-11-01T12:00:00Z").getTime();
const MIDNIGHT = new Date("2026-11-02T00:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOON);
  upstash.down = false;
  upstash.calls = 0;
  upstash.store.clear();
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("fixedWindow", () => {
  it("counts in Upstash under the limiter's prefix and resets at 00:00 UTC", async () => {
    const limiter = createRateLimiter({
      prefix: "qrdx:test-quota",
      limiter: fixedWindow(3, "1 d"),
    });
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.limit("user:u_1"));

    expect(results.map((r) => [r.success, r.remaining])).toEqual([
      [true, 2],
      [true, 1],
      [true, 0],
      [false, 0],
    ]);
    expect(results.every((r) => r.limit === 3 && r.reset === MIDNIGHT)).toBe(
      true,
    );
    expect([...upstash.store.keys()]).toEqual([
      `qrdx:test-quota:user:u_1:${Math.floor(NOON / DAY)}`,
    ]);
  });

  it("counts a request with a rate as that many in Upstash", async () => {
    const limiter = createRateLimiter({
      prefix: "qrdx:test-rate",
      limiter: fixedWindow(10, "1 d"),
    });
    expect(await limiter.limit("ip:1", 4)).toMatchObject({
      success: true,
      remaining: 6,
    });
    expect(await limiter.limit("ip:1", 7)).toMatchObject({ success: false });
    expect([...upstash.store.values()]).toEqual([11]);
  });

  it("keeps enforcing the same daily limit in memory while Upstash is down", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    upstash.down = true;
    const limiter = createRateLimiter({
      prefix: "qrdx:test-quota-outage",
      limiter: fixedWindow(5, "1 d"),
    });

    const today = [];
    for (let i = 0; i < 6; i++) today.push(await limiter.limit("org:o_1"));
    expect(today.map((r) => r.success)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(today.at(-1)).toMatchObject({
      limit: 5,
      remaining: 0,
      reset: MIDNIGHT,
      reason: "memory",
    });
    expect(upstash.store.size).toBe(0);

    // A minute into the next UTC day the whole limit is back: a fixed
    // window, nothing carried over from yesterday.
    vi.setSystemTime(MIDNIGHT + 60_000);
    const tomorrow = [];
    for (let i = 0; i < 6; i++) tomorrow.push(await limiter.limit("org:o_1"));
    expect(tomorrow.filter((r) => r.success)).toHaveLength(5);
    expect(tomorrow[0]).toMatchObject({ remaining: 4, reset: MIDNIGHT + DAY });

    // The outage was logged once, not per request.
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toMatch(/in-memory limits/);
    error.mockRestore();
  });
});
