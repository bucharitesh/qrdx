// Scheduling work for later marks the webhook worker due (lib/events/
// worker-due.ts), so the frequent GitHub Actions call runs it on time: a
// failed delivery's retry and a new scan batch's window both lower the
// marker. Tables are in memory (tests/support/fake-db.ts); the scan-batch SQL,
// which the fake can't evaluate, runs against a stub that answers every query
// with no rows. Redis is in memory and the webhook transport is replaced, so
// nothing touches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";
import type { FakeRedis } from "../support/fake-redis";

const state = vi.hoisted(() => ({
  redis: null as FakeRedis | null,
  /** Replaces the fake database while set */
  stub: null as unknown,
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock("@repo/database", async () => {
  const fake = (await import("../support/fake-db")).repoDatabase;
  const memory = fake.database as Record<PropertyKey, unknown>;
  const database = new Proxy(
    {},
    {
      get(_target, prop) {
        const db = (state.stub ?? memory) as Record<PropertyKey, unknown>;
        const value = db[prop];
        return typeof value === "function" ? value.bind(db) : value;
      },
    },
  );
  return { ...fake, database };
});
vi.mock("@repo/rate-limit", async () => {
  const { FakeRedis } = await import("../support/fake-redis");
  state.redis = new FakeRedis();
  return {
    redis: state.redis,
    slidingWindow: () => ({}),
    createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  };
});
vi.mock("@/lib/plans", () => ({
  getPlanForScope: async () => "business",
  getPlanLimits: () => ({ webhooks: true, emailAlerts: true }),
}));

const { processClaimed } = await import("@/lib/events/deliveries");
const { emitEvent } = await import("@/lib/events/emit");
const { setTransportForTests } = await import("@/lib/events/http");
const {
  WORKER_DUE_KEY,
  checkWorkerDue,
  forgetScheduledRunsForTests,
  reseedWorkerDue,
  scheduleWorkerRun,
} = await import("@/lib/events/worker-due");

const MINUTE = 60_000;
const T0 = Date.parse("2026-11-01T10:00:30Z");
const redis = () => state.redis as FakeRedis;
const scheduled = () =>
  redis()
    .members(WORKER_DUE_KEY)
    .filter(([member]) => member.startsWith("m:"))
    .map(([, score]) => score);
const ceilMinute = (time: number) => Math.ceil(time / MINUTE) * MINUTE;

/** Every chained call returns itself; awaiting it yields no rows. */
function emptyDb(): unknown {
  return new Proxy(() => undefined, {
    get: (_target, prop) =>
      prop === "then"
        ? (resolve: (rows: unknown[]) => void) => resolve([])
        : () => emptyDb(),
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  fakeDb.reset();
  redis().reset();
  forgetScheduledRunsForTests();
  state.stub = null;
  // A full run seeded the marker with nothing pending.
  await reseedWorkerDue(T0, null);
  redis().calls = [];
});

afterEach(() => {
  setTransportForTests(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("scheduling lowers the worker marker", () => {
  it("a failed delivery's retry", async () => {
    setTransportForTests(async () => ({ status: 503, body: "busy" }));
    fakeDb.seed("webhookEndpoint", [
      {
        id: "ep_1",
        userId: "u1",
        organizationId: null,
        url: "https://hooks.example.org/qrdx",
        secret: "whsec_test",
        active: true,
      },
    ]);
    const row = {
      id: "dl_1",
      endpointId: "ep_1",
      event: "code.created",
      payload: { id: "evt_1", type: "code.created" },
      status: "pending",
      attempts: 1, // claimed: the first attempt
      nextAttemptAt: new Date(T0 + 5 * MINUTE), // the lease
      lastError: null,
      createdAt: new Date(T0),
    };
    fakeDb.seed("webhookDelivery", [row]);
    expect(await checkWorkerDue(T0 + 10 * MINUTE)).toMatchObject({
      due: false,
    });

    const summary = await processClaimed([row as never]);

    expect(summary).toEqual({ succeeded: 0, retrying: 1, failed: 0 });
    const stored = fakeDb.find("webhookDelivery", { id: "dl_1" });
    expect(stored?.nextAttemptAt).toBeInstanceOf(Date);
    const retryAt = (stored?.nextAttemptAt as Date | undefined)?.getTime() ?? 0;
    // About a minute later (±10% jitter), rounded up to the minute.
    expect(retryAt - T0).toBeGreaterThanOrEqual(0.9 * MINUTE);
    expect(retryAt - T0).toBeLessThanOrEqual(1.1 * MINUTE);
    expect(scheduled()).toEqual([ceilMinute(retryAt)]);
    expect(await checkWorkerDue(T0)).toMatchObject({ due: false });
    expect(await checkWorkerDue(ceilMinute(retryAt))).toEqual({
      due: true,
      reason: "scheduled",
    });
  });

  it("a new scan batch, for when its window closes", async () => {
    state.stub = emptyDb();
    await emitEvent(
      "scan.created",
      {
        scan_id: "scan_1",
        code: { id: "code_1", slug: "aB3dE5f", title: null },
        scanned_at: new Date(T0).toISOString(),
        country: null,
        region: null,
        city: null,
        device_type: null,
        os: null,
        browser: null,
        referer: null,
      },
      { userId: "u1", organizationId: null },
      {
        subscribers: {
          plan: "business",
          endpoints: [{ id: "ep_1", events: ["scan.created"] }],
          targets: [],
        },
      },
    );

    expect(scheduled()).toEqual([ceilMinute(T0 + MINUTE)]);
    expect(await checkWorkerDue(T0 + 30_000)).toMatchObject({ due: false });
    expect(await checkWorkerDue(ceilMinute(T0 + MINUTE))).toMatchObject({
      due: true,
    });
  });

  it("keeps the earliest time and costs one call per minute", async () => {
    await scheduleWorkerRun(T0 + 16 * MINUTE);
    await scheduleWorkerRun(T0 + 4 * MINUTE);
    await scheduleWorkerRun(T0 + 4 * MINUTE + 10_000); // same minute
    expect(redis().calls.filter((name) => name === "zadd")).toHaveLength(2);
    expect(await checkWorkerDue(T0)).toEqual({
      due: false,
      nextDueAt: ceilMinute(T0 + 4 * MINUTE),
    });
  });

  it("never throws when Redis is down", async () => {
    redis().failing = true;
    await expect(scheduleWorkerRun(T0 + MINUTE)).resolves.toBeUndefined();
    expect(await checkWorkerDue(T0)).toEqual({
      due: true,
      reason: "redis-error",
    });
  });
});
