// GET /api/cron/webhooks: the frequent caller (?source=github, GitHub Actions
// every 5 minutes) checks the Upstash marker first and skips without touching
// Postgres while nothing is due; it runs in full when work is due or the
// marker can't be trusted; the daily Vercel call always runs in full; every
// full run re-seeds the marker. Redis is in memory (tests/support/fake-redis)
// and the database work is replaced by fakes that record their calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeRedis } from "../support/fake-redis";

const state = vi.hoisted(() => ({
  redis: null as FakeRedis | null,
  live: true,
  dbCalls: [] as string[],
  nextDeliveryDueAt: null as number | null | Error,
  nextSyncDueAt: null as number | null,
  integrations: { streams: 0, ok: 0, failed: 0, skipped: 0 },
}));

vi.mock("@repo/rate-limit", async () => {
  const { FakeRedis } = await import("../support/fake-redis");
  state.redis = new FakeRedis();
  return { redis: state.redis };
});
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => state.live,
}));
vi.mock("@/lib/events/deliveries", () => ({
  runDeliveryWorker: async () => {
    state.dbCalls.push("runDeliveryWorker");
    return { claimed: 0, succeeded: 0, retrying: 0, failed: 0 };
  },
  pruneDeliveries: async () => {
    state.dbCalls.push("pruneDeliveries");
    return 0;
  },
  nextDeliveryDueAt: async () => {
    state.dbCalls.push("nextDeliveryDueAt");
    if (state.nextDeliveryDueAt instanceof Error) throw state.nextDeliveryDueAt;
    return state.nextDeliveryDueAt;
  },
}));
vi.mock("@/lib/data-connections/sync", () => ({
  runIntegrationSyncs: async () => {
    state.dbCalls.push("runIntegrationSyncs");
    return state.integrations;
  },
  nextIntegrationSyncDueAt: async () => {
    state.dbCalls.push("nextIntegrationSyncDueAt");
    return state.nextSyncDueAt;
  },
}));

const { GET } = await import("@/app/api/cron/webhooks/route");
const { WORKER_DUE_KEY, forgetScheduledRunsForTests, scheduleWorkerRun } =
  await import("@/lib/events/worker-due");

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const T0 = Date.parse("2026-11-01T10:00:30Z");

const redis = () => state.redis as FakeRedis;
const marker = () => Object.fromEntries(redis().members(WORKER_DUE_KEY));

function call(source?: "github") {
  return GET(
    new Request(
      `https://qrdx.dev/api/cron/webhooks${source ? `?source=${source}` : ""}`,
      { headers: { authorization: "Bearer test" } },
    ),
  );
}

async function json(response: Response) {
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

const ranWorker = () => state.dbCalls.includes("runDeliveryWorker");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  redis().reset();
  forgetScheduledRunsForTests();
  state.live = true;
  state.dbCalls = [];
  state.nextDeliveryDueAt = null;
  state.nextSyncDueAt = null;
  state.integrations = { streams: 0, ok: 0, failed: 0, skipped: 0 };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("frequent calls (?source=github)", () => {
  it("skips without touching the database when nothing is due", async () => {
    state.nextDeliveryDueAt = T0 + 30 * MINUTE;
    await call(); // the daily run seeds the marker
    state.dbCalls = [];
    redis().calls = [];

    vi.setSystemTime(T0 + 5 * MINUTE);
    const body = await json(await call("github"));

    expect(body).toEqual({
      skipped: true,
      nextDueAt: new Date(T0 + 30 * MINUTE).toISOString(),
    });
    expect(state.dbCalls).toEqual([]);
    // Read the marker, then record a check (not a run) for /admin/health.
    expect(redis().calls).toEqual(["exec", "zscore", "zrange", "set"]);
    expect(redis().strings.get("qrdx:cron:last-check:webhooks")).toBe(
      new Date(T0 + 5 * MINUTE).toISOString(),
    );
    const run = JSON.parse(
      redis().strings.get("qrdx:cron:last-run:webhooks") ?? "{}",
    );
    expect(run.at).toBe(new Date(T0).toISOString());
  });

  it("runs once scheduled work is due, then drops what it handled", async () => {
    await call(); // seeded, nothing pending in the database
    await scheduleWorkerRun(T0 + 2 * MINUTE); // e.g. a retry in 2 minutes
    state.dbCalls = [];

    vi.setSystemTime(T0 + MINUTE);
    expect(await json(await call("github"))).toMatchObject({ skipped: true });
    expect(ranWorker()).toBe(false);

    vi.setSystemTime(T0 + 3 * MINUTE);
    const body = await json(await call("github"));
    expect(body.skipped).toBeUndefined();
    expect(state.dbCalls).toEqual([
      "runDeliveryWorker",
      "pruneDeliveries",
      "runIntegrationSyncs",
      "nextDeliveryDueAt",
      "nextIntegrationSyncDueAt",
    ]);
    expect(marker()).toEqual({ seeded: T0 + 3 * MINUTE + DAY });

    state.dbCalls = [];
    vi.setSystemTime(T0 + 8 * MINUTE);
    expect(await json(await call("github"))).toMatchObject({ skipped: true });
    expect(ranWorker()).toBe(false);
  });

  it("runs in full when the marker is missing, and seeds it", async () => {
    const body = await json(await call("github"));
    expect(body.skipped).toBeUndefined();
    expect(ranWorker()).toBe(true);
    expect(marker()).toEqual({ seeded: T0 + DAY });
  });

  it("runs in full when only scheduled members exist (expired or never seeded)", async () => {
    await scheduleWorkerRun(T0 + 30 * MINUTE);
    expect(await json(await call("github"))).not.toHaveProperty("skipped");
    expect(ranWorker()).toBe(true);
    // The future member survives the run.
    expect(marker()).toEqual({
      seeded: T0 + DAY,
      [`m:${Math.ceil((T0 + 30 * MINUTE) / MINUTE)}`]:
        Math.ceil((T0 + 30 * MINUTE) / MINUTE) * MINUTE,
    });
  });

  it("runs in full when Redis fails", async () => {
    await call();
    state.dbCalls = [];
    redis().failing = true;
    const body = await json(await call("github"));
    expect(body.skipped).toBeUndefined();
    expect(ranWorker()).toBe(true);
  });

  it("runs again when the marker couldn't be re-seeded", async () => {
    state.nextDeliveryDueAt = new Error("database unavailable");
    await json(await call("github"));
    expect(ranWorker()).toBe(true);
    expect(marker()).toEqual({});

    state.dbCalls = [];
    vi.setSystemTime(T0 + 5 * MINUTE);
    await json(await call("github"));
    expect(ranWorker()).toBe(true);
  });
});

describe("the daily call", () => {
  it("always runs and re-seeds from the database", async () => {
    // Seeded and nothing due for an hour: the frequent caller would skip.
    state.nextDeliveryDueAt = T0 + 60 * MINUTE;
    await call();
    await scheduleWorkerRun(T0 + 90 * MINUTE);
    state.dbCalls = [];

    vi.setSystemTime(T0 + 10 * MINUTE);
    state.nextDeliveryDueAt = T0 + 45 * MINUTE;
    state.nextSyncDueAt = T0 + 20 * MINUTE;
    const body = await json(await call());

    expect(body.skipped).toBeUndefined();
    expect(ranWorker()).toBe(true);
    const later = Math.ceil((T0 + 90 * MINUTE) / MINUTE);
    expect(marker()).toEqual({
      db: T0 + 20 * MINUTE, // the earliest of deliveries and syncs
      [`m:${later}`]: later * MINUTE,
      seeded: T0 + 10 * MINUTE + DAY,
    });
    expect(redis().ttl.get(WORKER_DUE_KEY)).toBeGreaterThan(DAY / 1000);
  });

  it("keeps the worker due when syncs ran out of time", async () => {
    state.integrations = { streams: 3, ok: 1, failed: 0, skipped: 0 };
    await call();
    vi.setSystemTime(T0 + 5 * MINUTE);
    state.dbCalls = [];
    await json(await call("github"));
    expect(ranWorker()).toBe(true);
  });

  it("doesn't touch the database outside production", async () => {
    state.live = false;
    expect(await json(await call())).toEqual({
      skipped: true,
      reason: "delivery_off",
      trigger: "daily",
    });
    expect(await json(await call("github"))).toEqual({
      skipped: true,
      reason: "delivery_off",
      trigger: "unseeded",
    });
    expect(state.dbCalls).toEqual([]);
    expect(redis().strings.size + redis().sets.size).toBe(0);
  });
});
