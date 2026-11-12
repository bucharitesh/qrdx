// The admin memo keeps a promise per key so concurrent loads share one call.
// Failures are kept too (a dead service isn't hammered), but a long cache
// (/admin/growth keeps npm and Search Console for 6 hours) can keep them for
// a shorter time, so a passing outage doesn't stick for hours.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached } from "@/app/(app)/admin/_lib/cache";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
let n = 0;
const key = () => `test:${++n}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("cached", () => {
  it("shares one call per key until the time is up", async () => {
    const id = key();
    const load = vi.fn(async () => "value");
    await Promise.all([cached(id, HOUR, load), cached(id, HOUR, load)]);
    vi.advanceTimersByTime(HOUR - 1);
    await cached(id, HOUR, load);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await cached(id, HOUR, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps a failure as long as a success by default", async () => {
    const id = key();
    const load = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(cached(id, HOUR, load)).rejects.toThrow("down");
    vi.advanceTimersByTime(30 * MINUTE);
    await expect(cached(id, HOUR, load)).rejects.toThrow("down");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps a failure only for failureTtlMs when that's shorter", async () => {
    const id = key();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue("back");
    await expect(cached(id, 6 * HOUR, load, 5 * MINUTE)).rejects.toThrow(
      "down",
    );
    vi.advanceTimersByTime(5 * MINUTE - 1);
    await expect(cached(id, 6 * HOUR, load, 5 * MINUTE)).rejects.toThrow(
      "down",
    );
    vi.advanceTimersByTime(1);
    await expect(cached(id, 6 * HOUR, load, 5 * MINUTE)).resolves.toBe("back");
    // The success is kept for the full time.
    vi.advanceTimersByTime(6 * HOUR - 1);
    await cached(id, 6 * HOUR, load, 5 * MINUTE);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
