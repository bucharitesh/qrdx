// @repo/rate-limit when Upstash misbehaves: the circuit breaker opens only
// after several failures in a row, stays open for a short cooldown, probes
// with one request, and meanwhile an in-memory limiter keeps enforcing the
// limits instead of allowing everything.

import {
  createCircuitBreaker,
  createMemoryLimiter,
  type LimitResult,
  parseDuration,
  withFallback,
} from "@repo/rate-limit/fallback";
import { describe, expect, it, vi } from "vitest";

function clock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const ok = (overrides: Partial<LimitResult> = {}): LimitResult => ({
  success: true,
  limit: 10,
  remaining: 9,
  reset: 0,
  pending: Promise.resolve(),
  ...overrides,
});

describe("parseDuration", () => {
  it("reads Upstash window strings", () => {
    expect(parseDuration("60 s")).toBe(60_000);
    expect(parseDuration("10m")).toBe(600_000);
    expect(parseDuration("1 h")).toBe(3_600_000);
    expect(parseDuration("1 d")).toBe(86_400_000);
    expect(parseDuration("250 ms")).toBe(250);
    expect(() => parseDuration("soon")).toThrow();
  });
});

describe("createMemoryLimiter", () => {
  it("allows the window's tokens, then blocks until the window slides", () => {
    const time = clock(0);
    const memory = createMemoryLimiter({ tokens: 3, windowMs: 1000 }, time.now);
    expect([1, 2, 3, 4].map(() => memory.limit("ip:1").success)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    // Other keys have their own budget.
    expect(memory.limit("ip:2").success).toBe(true);
    // Two windows later the old requests no longer count.
    time.advance(2000);
    expect(memory.limit("ip:1").success).toBe(true);
  });

  it("weights the previous window like a sliding window", () => {
    const time = clock(0);
    const memory = createMemoryLimiter(
      { tokens: 10, windowMs: 1000 },
      time.now,
    );
    for (let i = 0; i < 10; i++) memory.limit("k");
    // Halfway into the next window, half of the previous 10 still count.
    time.advance(1500);
    const allowed = Array.from(
      { length: 10 },
      () => memory.limit("k").success,
    ).filter(Boolean).length;
    expect(allowed).toBe(5);
  });

  it("keeps a bounded number of keys", () => {
    const memory = createMemoryLimiter(
      { tokens: 1, windowMs: 60_000 },
      () => 0,
      100,
    );
    for (let i = 0; i < 1000; i++) memory.limit(`ip:${i}`);
    expect(memory.size).toBeLessThanOrEqual(100);
  });
});

describe("createCircuitBreaker", () => {
  it("stays closed through isolated failures", () => {
    const log = vi.fn();
    const breaker = createCircuitBreaker({ failureThreshold: 3, log });
    breaker.onFailure();
    breaker.onFailure();
    breaker.onSuccess();
    breaker.onFailure();
    breaker.onFailure();
    expect(breaker.state).toBe("closed");
    expect(log).not.toHaveBeenCalled();
  });

  it("opens after consecutive failures, probes once after the cooldown, and logs each change once", () => {
    const time = clock();
    const log = vi.fn();
    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 30_000,
      now: time.now,
      log,
    });
    for (let i = 0; i < 3; i++) breaker.onFailure("timeout");
    expect(breaker.state).toBe("open");
    expect(breaker.tryAcquire()).toBe(false);
    // More failures while open don't log again.
    breaker.onFailure();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatch(/in-memory limits/);

    time.advance(30_000);
    expect(breaker.state).toBe("half-open");
    expect(breaker.tryAcquire()).toBe(true);
    // Only one probe at a time.
    expect(breaker.tryAcquire()).toBe(false);

    // The probe fails: open again for another cooldown, no new log.
    breaker.onFailure();
    expect(breaker.state).toBe("open");
    expect(log).toHaveBeenCalledTimes(1);
    time.advance(29_000);
    expect(breaker.tryAcquire()).toBe(false);
    time.advance(1000);
    expect(breaker.tryAcquire()).toBe(true);

    // The probe succeeds: closed, logged once.
    breaker.onSuccess();
    expect(breaker.state).toBe("closed");
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[1]?.[0]).toMatch(/reachable again/);
    expect(breaker.tryAcquire()).toBe(true);
  });
});

describe("withFallback", () => {
  function setup(upstash: (id: string) => Promise<LimitResult>) {
    const time = clock();
    const log = vi.fn();
    const breaker = createCircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 30_000,
      now: time.now,
      log,
    });
    const memory = createMemoryLimiter(
      { tokens: 2, windowMs: 60_000 },
      time.now,
    );
    const spy = vi.fn(upstash);
    return {
      time,
      log,
      breaker,
      spy,
      limit: withFallback(spy, memory, breaker),
    };
  }

  it("uses Upstash while it answers", async () => {
    const { limit, spy } = setup(async () =>
      ok({ success: false, remaining: 0 }),
    );
    expect((await limit("a")).success).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("never allows everything: errors and timeouts are judged in memory", async () => {
    const { limit } = setup(async () => {
      throw new Error("fetch failed");
    });
    const results = await Promise.all([1, 2, 3].map(() => limit("ip:1")));
    expect(results.map((r) => r.success)).toEqual([true, true, false]);

    const timeouts = setup(async () => ok({ reason: "timeout" }));
    const timed = [];
    for (let i = 0; i < 3; i++)
      timed.push((await timeouts.limit("ip:1")).success);
    expect(timed).toEqual([true, true, false]);
  });

  it("stops calling Upstash while open and recovers through one probe", async () => {
    let down = true;
    const { limit, spy, time, breaker, log } = setup(async () => {
      if (down) throw new Error("ECONNRESET");
      return ok();
    });
    for (let i = 0; i < 3; i++) await limit(`id:${i}`);
    expect(breaker.state).toBe("open");
    expect(spy).toHaveBeenCalledTimes(3);

    // Open: requests don't wait on Upstash at all.
    for (let i = 0; i < 5; i++) await limit(`other:${i}`);
    expect(spy).toHaveBeenCalledTimes(3);

    down = false;
    time.advance(30_000);
    expect((await limit("probe")).reason).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(4);
    expect(breaker.state).toBe("closed");
    expect(log).toHaveBeenCalledTimes(2);
  });
});
