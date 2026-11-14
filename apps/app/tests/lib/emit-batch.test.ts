// code.created for a large batch (lib/events/emit.ts): every webhook
// delivery is stored up front (so none is lost if the function stops), the
// first 50 are sent right away and the worker is marked due for the rest;
// alerts stop at the targets' hourly limit of 30.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  deliveredNow: [] as string[][],
  scheduled: 0,
  alerts: 0,
  plan: "business" as "free" | "pro" | "business",
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/events/deliveries", () => ({
  claimDueDeliveries: async () => [],
  processClaimed: async () => ({ succeeded: 0, retrying: 0, failed: 0 }),
  deliverNow: async (ids: string[]) => {
    state.deliveredNow.push(ids);
  },
}));
vi.mock("@/lib/events/worker-due", () => ({
  scheduleWorkerRun: async () => {
    state.scheduled++;
  },
}));
vi.mock("@/lib/events/notify", () => ({
  isAlertEvent: () => true,
  notifyTargets: async () => {
    state.alerts++;
  },
}));
vi.mock("@/lib/events/subscribers", () => ({
  loadSubscribers: async () => ({
    plan: state.plan,
    endpoints: [
      { id: "ep_1", events: ["code.created"] },
      { id: "ep_2", events: ["scan.created"] },
    ],
    targets: [{ id: "t_1", channel: "slack", events: ["code.created"] }],
  }),
}));

const { emitCodesCreated } = await import("@/lib/events/emit");

const codes = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `code_${i}`,
    slug: `Slug${String(i).padStart(3, "0")}`,
    title: null,
    destinationUrl: `https://example.com/${i}`,
    scanCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

/** emitCodesCreated runs detached outside a request: let it finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

beforeEach(() => {
  fakeDb.resetAll();
  state.deliveredNow = [];
  state.scheduled = 0;
  state.alerts = 0;
  state.plan = "business";
});

describe("emitCodesCreated for a large batch", () => {
  it("stores every delivery, sends the first 50 and leaves the rest to the worker", async () => {
    emitCodesCreated({ userId: "u", organizationId: "org" }, codes(1000));
    await settle();
    const rows = fakeDb.rows("webhookDelivery");
    expect(rows).toHaveLength(1000);
    expect(new Set(rows.map((row) => row.endpointId))).toEqual(
      new Set(["ep_1"]),
    );
    expect(rows[0]).toMatchObject({ event: "code.created", status: "pending" });
    expect(state.deliveredNow).toHaveLength(1);
    expect(state.deliveredNow[0]).toHaveLength(50);
    expect(state.scheduled).toBe(1);
    expect(state.alerts).toBe(30);
  });

  it("stores no deliveries on a plan without webhooks", async () => {
    state.plan = "pro";
    emitCodesCreated({ userId: "u", organizationId: "org" }, codes(200));
    await settle();
    expect(fakeDb.rows("webhookDelivery")).toHaveLength(0);
    expect(state.deliveredNow).toHaveLength(0);
  });
});
