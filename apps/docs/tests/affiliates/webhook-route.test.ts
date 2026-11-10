// The Polar webhook route (app/api/webhook/polar) with the affiliate step:
// the signature is checked before anything runs, the billing state is saved
// first, and the affiliate step can never fail the webhook. A thrown
// affiliate error still gets Polar a 2xx and keeps the plan change; so do
// affiliate tables that don't exist yet. Requests are signed like Polar's
// (Standard Webhooks, HMAC-SHA256) with a fake secret.
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  // lib/env reads this when the route loads.
  process.env.POLAR_WEBHOOK_SECRET = "test-polar-webhook-secret";
  // The program's switch (lib/feature-availability reads it on load).
  process.env.QRDX_AFFILIATES = "1";
  return { throwInAffiliateStep: false, affiliateCalls: [] as string[] };
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/ee/audit-log/plan-change", () => ({
  plansBeforeBillingChange: async () => null,
  recordPlanChanges: async () => {},
}));
vi.mock("@/lib/analytics/server", () => ({ trackServer: () => {} }));
vi.mock("@/lib/affiliates/commissions", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("@/lib/affiliates/commissions")>();
  return {
    ...real,
    handleAffiliateWebhook: async (
      ...args: Parameters<typeof real.handleAffiliateWebhook>
    ) => {
      state.affiliateCalls.push(args[0].type);
      if (state.throwInAffiliateStep) throw new Error("affiliate step broke");
      return real.handleAffiliateWebhook(...args);
    },
  };
});

import { POST } from "@/app/api/webhook/polar/route";
import { fakeDb } from "../support/fake-db";
import {
  CUSTOMER,
  polarOrder,
  resetAffiliateDb,
  seedAffiliate,
  seedReferral,
} from "./seed";

const SECRET = "test-polar-webhook-secret";

function signed(payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload);
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new Request("http://localhost:3000/api/webhook/polar", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
    },
    body,
  });
}

const subscriptionEvent = (status = "active") => ({
  type: "subscription.updated",
  timestamp: new Date().toISOString(),
  data: {
    id: "sub_1",
    created_at: "2026-02-01T12:00:00Z",
    modified_at: "2026-02-01T12:00:05Z",
    amount: 1500,
    currency: "usd",
    recurring_interval: "month",
    status,
    current_period_start: "2026-02-01T12:00:00Z",
    current_period_end: "2026-03-01T12:00:00Z",
    cancel_at_period_end: false,
    canceled_at: null,
    started_at: "2026-02-01T12:00:00Z",
    ends_at: null,
    ended_at: null,
    customer_id: "polar_customer_1",
    product_id: "prod_business_monthly",
    discount_id: null,
    checkout_id: "checkout_1",
    customer_cancellation_reason: null,
    customer_cancellation_comment: null,
    metadata: {},
    custom_field_data: {},
    customer: { external_id: CUSTOMER.id, email: CUSTOMER.email },
  },
});

const orderPaidEvent = () => ({
  type: "order.paid",
  timestamp: "2026-02-01T12:00:10Z",
  data: polarOrder(),
});

const post = (request: Request) =>
  POST(request as unknown as Parameters<typeof POST>[0]);

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.throwInAffiliateStep = false;
  state.affiliateCalls = [];
  resetAffiliateDb();
  seedAffiliate();
  seedReferral();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("the signature comes first", () => {
  it("refuses a request signed with another secret, before billing or affiliates run", async () => {
    const response = await post(signed(subscriptionEvent(), "not-the-secret"));
    expect(response.status).toBe(403);
    expect(fakeDb.rows("subscription")).toEqual([]);
    expect(state.affiliateCalls).toEqual([]);
  });

  it("refuses an unsigned request", async () => {
    const response = await post(
      new Request("http://localhost:3000/api/webhook/polar", {
        method: "POST",
        body: JSON.stringify(orderPaidEvent()),
      }),
    );
    expect(response.status).toBe(403);
    expect(state.affiliateCalls).toEqual([]);
    expect(fakeDb.rows("affiliateCommission")).toEqual([]);
  });
});

describe("a thrown affiliate error", () => {
  it("still returns 2xx and keeps the plan change", async () => {
    state.throwInAffiliateStep = true;
    const response = await post(signed(subscriptionEvent()));
    expect(response.status).toBe(200);
    // The billing state was saved before the affiliate step ran.
    expect(fakeDb.find("subscription", { id: "sub_1" })).toMatchObject({
      status: "active",
      productId: "prod_business_monthly",
      userId: CUSTOMER.id,
    });
    expect(state.affiliateCalls).toEqual(["subscription.updated"]);
    expect(
      errors.mock.calls.some((call: unknown[]) =>
        String(call[0]).includes("affiliates.webhook_failed"),
      ),
    ).toBe(true);
  });

  it("still returns 2xx for an order", async () => {
    state.throwInAffiliateStep = true;
    const response = await post(signed(orderPaidEvent()));
    expect(response.status).toBe(200);
    expect(fakeDb.rows("affiliateCommission")).toEqual([]);
  });
});

describe("through the route, end to end", () => {
  it("a signed order.paid creates one commission, however often Polar sends it", async () => {
    expect((await post(signed(orderPaidEvent()))).status).toBe(200);
    expect((await post(signed(orderPaidEvent()))).status).toBe(200);
    expect(fakeDb.rows("affiliateCommission")).toEqual([
      expect.objectContaining({
        polarOrderId: "order_1",
        amount: 450,
        status: "pending",
      }),
    ]);
  });

  it("a signed refund.created voids it", async () => {
    await post(signed(orderPaidEvent()));
    const response = await post(
      signed({
        type: "refund.created",
        timestamp: "2026-02-05T00:00:00Z",
        data: {
          id: "refund_1",
          status: "succeeded",
          amount: 1500,
          tax_amount: 0,
          order_id: "order_1",
          created_at: "2026-02-05T00:00:00Z",
          reason: "customer_request",
          dispute: null,
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(fakeDb.rows("affiliateCommission")[0]).toMatchObject({
      status: "void",
      voidRefundId: "refund_1",
    });
  });
});

describe("before the affiliate SQL is applied", () => {
  beforeEach(() => {
    fakeDb.missing(
      "affiliate",
      "affiliateReferral",
      "affiliateCommission",
      "affiliatePayout",
    );
  });

  it("a plan change still saves and returns 2xx", async () => {
    const response = await post(signed(subscriptionEvent()));
    expect(response.status).toBe(200);
    expect(fakeDb.find("subscription", { id: "sub_1" })?.status).toBe("active");
  });

  it("order.paid and refunds return 2xx and record nothing", async () => {
    expect((await post(signed(orderPaidEvent()))).status).toBe(200);
    expect(
      (
        await post(
          signed({
            type: "order.refunded",
            timestamp: "2026-02-05T00:00:00Z",
            data: { ...polarOrder(), refunded_amount: 1500 },
          }),
        )
      ).status,
    ).toBe(200);
  });
});
