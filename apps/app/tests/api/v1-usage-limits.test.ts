// The REST API's usage counts (lib/analytics/usage.ts, usage_daily) can't be
// driven by requests QRdx turns away: a request refused with a 429 isn't
// counted, and an unknown /v1 path counts at most 30 times a minute per IP
// (the JSON 404 is still sent past that). Real requests still count. Runs
// the routes against the in-memory database and the rate-limit package's
// in-memory window.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ refuse: false, generation: 0 }));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // No request here: count now.
  after: () => {
    throw new Error("outside a request");
  },
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("@repo/rate-limit", async () => {
  const { createMemoryLimiter, parseDuration } = await import(
    "@repo/rate-limit/fallback"
  );
  return {
    slidingWindow: (tokens: number, window: string) => ({
      tokens,
      windowMs: parseDuration(window),
    }),
    fixedWindow: (tokens: number, window: string) => ({
      tokens,
      windowMs: parseDuration(window),
      sliding: false,
    }),
    createRateLimiter: ({
      limiter,
    }: {
      limiter: { tokens: number; windowMs: number };
    }) => {
      let generation = -1;
      let memory = createMemoryLimiter(limiter);
      return {
        limit: async (key: string, rate?: number) => {
          if (generation !== state.generation) {
            generation = state.generation;
            memory = createMemoryLimiter(limiter);
          }
          if (state.refuse) {
            return {
              success: false,
              limit: limiter.tokens,
              remaining: 0,
              reset: Date.now() + 30_000,
              pending: Promise.resolve(),
            };
          }
          return memory.limit(key, rate);
        },
      };
    },
  };
});

import { recordUsageInTests } from "@/lib/analytics/usage";
import { fakeDb } from "../support/fake-db";

const missing = await import("@/app/api/v1/[[...missing]]/route");
const qr = await import("@/app/api/v1/qr/route");

const ORIGIN = "http://localhost:3000";

const counts = () =>
  Object.fromEntries(
    fakeDb
      .rows("usageDaily")
      .map(({ metric, key, count }) => [`${metric} ${key}`, Number(count)]),
  );
const total = () =>
  fakeDb.rows("usageDaily").reduce((sum, row) => sum + Number(row.count), 0);
/** The counts once the writes have landed, and nothing more after them. */
async function settled(expected: number) {
  await vi.waitFor(() => expect(total()).toBe(expected));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(total()).toBe(expected);
  return counts();
}

const unknownPath = (ip: string) =>
  missing.GET(
    new NextRequest(new URL("/api/v1/nope", ORIGIN), {
      headers: { "x-real-ip": ip },
    }),
    { params: Promise.resolve({ missing: ["nope"] }) },
  );
const qrImage = (ip: string) =>
  qr.GET(
    new NextRequest(new URL("/api/v1/qr?data=hello", ORIGIN), {
      headers: { "x-real-ip": ip },
    }),
  );

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("usageDaily", "day", "channel", "metric", "key");
  state.refuse = false;
  state.generation++;
  recordUsageInTests(true);
  return () => recordUsageInTests(false);
});

describe("unknown /v1 paths", () => {
  it("count up to 30 a minute per IP, and still answer 404 past that", async () => {
    for (let i = 0; i < 30; i++) {
      expect((await unknownPath("203.0.113.1")).status).toBe(404);
    }
    expect(await settled(60)).toEqual({
      "request unknown:anon": 30,
      "error unknown:4xx": 30,
    });

    const over = await unknownPath("203.0.113.1");
    expect(over.status).toBe(404);
    expect((await over.json()).code).toBe("NOT_FOUND");
    await settled(60);

    // Another address is counted.
    await unknownPath("203.0.113.2");
    expect(await settled(62)).toMatchObject({ "request unknown:anon": 31 });
  });
});

describe("requests refused with a 429", () => {
  it("aren't counted; served ones are", async () => {
    expect((await qrImage("203.0.113.3")).status).toBe(200);
    expect(await settled(1)).toEqual({ "request qr:anon": 1 });

    state.refuse = true;
    for (let i = 0; i < 5; i++) {
      expect((await qrImage("203.0.113.3")).status).toBe(429);
    }
    expect((await unknownPath("203.0.113.3")).status).toBe(404);
    expect(await settled(1)).toEqual({ "request qr:anon": 1 });
  });
});
