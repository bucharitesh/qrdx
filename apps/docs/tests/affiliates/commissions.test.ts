// Commissions from Polar's webhooks (lib/affiliates/commissions.ts), run
// against the in-memory database: one per paid order however often the
// webhook comes, 30% of net_amount less refunds, only in the customer's
// first 12 months, voided by a refund or chargeback inside the 30-day hold
// and never by one after, never for self-referral, never for an affiliate
// who isn't approved, and the daily release of held commissions.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

import {
  handleAffiliateWebhook,
  releaseHeldCommissions,
} from "@/lib/affiliates/commissions";
import { fakeDb } from "../support/fake-db";
import {
  AFFILIATE_USER,
  CUSTOMER,
  polarOrder,
  resetAffiliateDb,
  seedAffiliate,
  seedReferral,
} from "./seed";

const DAY = 24 * 60 * 60 * 1000;
const PAID_AT = "2026-02-01T12:00:10Z";

const paid = (order = polarOrder(), timestamp = PAID_AT) =>
  handleAffiliateWebhook(
    { type: "order.paid", timestamp, data: order },
    { now: new Date(timestamp) },
  );

const commissions = () => fakeDb.rows("affiliateCommission");

beforeEach(() => {
  resetAffiliateDb();
  seedAffiliate();
  seedReferral();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("a paid order from a referred customer", () => {
  it("creates a pending commission of 30% of net_amount, payable 30 days later", async () => {
    const result = await paid();
    expect(result.status).toBe("created");
    expect(commissions()).toHaveLength(1);
    const [row] = commissions();
    expect(row).toMatchObject({
      affiliateId: "aff_1",
      referralId: "ref_1",
      referredUserId: CUSTOMER.id,
      polarOrderId: "order_1",
      polarCustomerId: "polar_customer_1",
      currency: "usd",
      orderAmount: 1500,
      rateBps: 3000,
      amount: 450,
      status: "pending",
      voidReason: null,
    });
    const orderPaidAt = row?.orderPaidAt as Date;
    const availableAt = row?.availableAt as Date;
    expect(orderPaidAt.toISOString()).toBe("2026-02-01T12:00:10.000Z");
    expect(availableAt.getTime() - orderPaidAt.getTime()).toBe(30 * DAY);
  });

  it("keeps the currency Polar reports, in minor units", async () => {
    await paid(
      polarOrder({ id: "order_inr", currency: "inr", net_amount: 19_900 }),
    );
    expect(commissions()[0]).toMatchObject({
      currency: "inr",
      orderAmount: 19_900,
      amount: 5_970,
    });
  });

  it("starts the customer's 12 months at their first payment", async () => {
    await paid();
    expect(
      fakeDb.find("affiliateReferral", { id: "ref_1" })?.firstPaidAt,
    ).toEqual(new Date(PAID_AT));
  });

  it("is idempotent: the same order delivered again makes no second commission", async () => {
    expect((await paid()).status).toBe("created");
    expect((await paid()).status).toBe("duplicate");
    expect((await paid(polarOrder(), "2026-02-01T12:30:00Z")).status).toBe(
      "duplicate",
    );
    expect(commissions()).toHaveLength(1);
    expect(commissions()[0]?.amount).toBe(450);
  });

  it("finds the account through the subscription when the customer has no external id", async () => {
    fakeDb.seed("subscription", [
      {
        id: "sub_1",
        customerId: "polar_customer_1",
        userId: CUSTOMER.id,
        status: "active",
      },
    ]);
    const result = await paid(polarOrder({ external_id: null }));
    expect(result.status).toBe("created");
  });
});

describe("orders that earn nothing", () => {
  it("ignores customers nobody referred", async () => {
    fakeDb.reset();
    resetAffiliateDb();
    seedAffiliate();
    expect(await paid()).toEqual({ status: "skipped", reason: "not_referred" });
    expect(commissions()).toHaveLength(0);
  });

  it("ignores an affiliate who isn't approved (suspended)", async () => {
    resetAffiliateDb();
    seedAffiliate({ status: "suspended" });
    seedReferral();
    expect(await paid()).toEqual({
      status: "skipped",
      reason: "affiliate_not_approved",
    });
    expect(commissions()).toHaveLength(0);
  });

  it("ignores a free order and doesn't start the 12 months with it", async () => {
    expect(await paid(polarOrder({ net_amount: 0 }))).toEqual({
      status: "skipped",
      reason: "zero_amount",
    });
    expect(fakeDb.find("affiliateReferral", { id: "ref_1" })?.firstPaidAt).toBe(
      null,
    );
  });

  it("stops 12 months after the first payment", async () => {
    await paid(polarOrder({ id: "order_first" }), "2026-02-01T12:00:00Z");
    const lastIn = await paid(
      polarOrder({ id: "order_last_in" }),
      "2027-02-01T11:59:59Z",
    );
    const firstOut = await paid(
      polarOrder({ id: "order_out" }),
      "2027-02-01T12:00:00Z",
    );
    expect(lastIn.status).toBe("created");
    expect(firstOut).toEqual({ status: "skipped", reason: "outside_window" });
    expect(commissions().map((row) => row.polarOrderId)).toEqual([
      "order_first",
      "order_last_in",
    ]);
  });

  it("uses the earliest payment even when webhooks arrive out of order", async () => {
    await paid(polarOrder({ id: "order_later" }), "2026-06-01T00:00:00Z");
    await paid(polarOrder({ id: "order_earlier" }), "2026-03-01T00:00:00Z");
    expect(
      fakeDb.find("affiliateReferral", { id: "ref_1" })?.firstPaidAt,
    ).toEqual(new Date("2026-03-01T00:00:00Z"));
    // So a payment 12 months after the earlier one is out.
    expect(
      await paid(polarOrder({ id: "order_out" }), "2027-03-01T00:00:00Z"),
    ).toEqual({ status: "skipped", reason: "outside_window" });
  });
});

describe("self-referral never earns", () => {
  it("when the customer is the affiliate", async () => {
    resetAffiliateDb();
    seedAffiliate();
    seedReferral({ referredUserId: AFFILIATE_USER.id });
    const result = await paid(polarOrder({ external_id: AFFILIATE_USER.id }));
    expect(result).toMatchObject({
      status: "created",
      voidReason: "self_referral",
    });
    expect(commissions()[0]).toMatchObject({
      status: "void",
      voidReason: "self_referral",
    });
  });

  it("when the Polar customer's email is the affiliate's under another spelling", async () => {
    const result = await paid(
      polarOrder({ email: "AnaDiaz+billing@gmail.com" }),
    );
    expect(result).toMatchObject({
      status: "created",
      voidReason: "self_referral",
    });
    expect(commissions()[0]?.status).toBe("void");
  });

  it("when the customer joined one of the affiliate's workspaces after signing up", async () => {
    const at = new Date("2026-01-03T00:00:00Z");
    fakeDb.seed("member", [
      {
        id: "m1",
        organizationId: "org_ana",
        userId: AFFILIATE_USER.id,
        role: "owner",
        createdAt: at,
      },
      {
        id: "m2",
        organizationId: "org_ana",
        userId: CUSTOMER.id,
        role: "member",
        createdAt: at,
      },
    ]);
    const result = await paid();
    expect(result).toMatchObject({
      status: "created",
      voidReason: "self_referral",
    });
  });

  it("but a workspace the affiliate isn't in doesn't count", async () => {
    const at = new Date("2026-01-03T00:00:00Z");
    fakeDb.seed("member", [
      {
        id: "m1",
        organizationId: "org_ana",
        userId: AFFILIATE_USER.id,
        role: "owner",
        createdAt: at,
      },
      {
        id: "m2",
        organizationId: "org_bob",
        userId: CUSTOMER.id,
        role: "owner",
        createdAt: at,
      },
    ]);
    expect(await paid()).toMatchObject({ status: "created", voidReason: null });
  });
});

describe("refunds and chargebacks", () => {
  const refund = (
    overrides: Partial<{
      id: string;
      status: string;
      amount: number;
      created_at: string;
      reason: string;
      dispute: unknown;
    }> = {},
  ) => ({
    id: "refund_1",
    status: "succeeded",
    amount: 1500,
    tax_amount: 0,
    order_id: "order_1",
    created_at: "2026-02-10T00:00:00Z",
    reason: "customer_request",
    dispute: null,
    ...overrides,
  });

  it("a refund inside the 30 days voids the commission, keyed by the refund id", async () => {
    await paid();
    const result = await handleAffiliateWebhook(
      {
        type: "refund.created",
        timestamp: "2026-02-10T00:00:01Z",
        data: refund(),
      },
      { now: new Date("2026-02-10T00:00:01Z") },
    );
    expect(result).toEqual({ status: "voided", reason: "refund" });
    expect(commissions()[0]).toMatchObject({
      status: "void",
      voidReason: "refund",
      voidRefundId: "refund_1",
    });
  });

  it("a partial refund inside the 30 days voids it too", async () => {
    await paid();
    await handleAffiliateWebhook({
      type: "refund.created",
      data: refund({ amount: 500 }),
    });
    expect(commissions()[0]?.status).toBe("void");
  });

  it("a refund Polar made to head off a dispute counts as a chargeback", async () => {
    await paid();
    await handleAffiliateWebhook({
      type: "refund.updated",
      data: refund({
        reason: "dispute_prevention",
        dispute: { id: "d1", status: "prevented" },
      }),
    });
    expect(commissions()[0]).toMatchObject({
      status: "void",
      voidReason: "chargeback",
    });
  });

  it("order.refunded voids it as well, and the refund event adds its id later", async () => {
    await paid();
    const order = {
      ...polarOrder(),
      status: "refunded",
      refunded_amount: 1500,
      modified_at: "2026-02-05T00:00:00Z",
    };
    expect(
      await handleAffiliateWebhook({ type: "order.refunded", data: order }),
    ).toEqual({ status: "voided", reason: "refund" });
    expect(commissions()[0]?.voidRefundId).toBe(null);
    await handleAffiliateWebhook({
      type: "refund.created",
      data: refund({ dispute: { id: "d1" } }),
    });
    expect(commissions()[0]).toMatchObject({
      status: "void",
      voidReason: "chargeback",
      voidRefundId: "refund_1",
    });
  });

  it("repeated refund webhooks change nothing more", async () => {
    await paid();
    await handleAffiliateWebhook({ type: "refund.created", data: refund() });
    const before = structuredClone(commissions()[0]);
    expect(
      await handleAffiliateWebhook({ type: "refund.updated", data: refund() }),
    ).toEqual({ status: "skipped", reason: "already_void" });
    expect(commissions()[0]).toEqual(before);
  });

  it("a refund after the 30 days leaves it payable", async () => {
    await paid();
    expect(
      await handleAffiliateWebhook({
        type: "refund.created",
        data: refund({ created_at: "2026-03-05T00:00:00Z" }),
      }),
    ).toEqual({ status: "skipped", reason: "after_hold" });
    expect(commissions()[0]?.status).toBe("pending");
  });

  it("a refund that hasn't gone through, or of tax only, changes nothing", async () => {
    await paid();
    await handleAffiliateWebhook({
      type: "refund.created",
      data: refund({ status: "pending" }),
    });
    await handleAffiliateWebhook({
      type: "refund.created",
      data: refund({ amount: 0 }),
    });
    await handleAffiliateWebhook({
      type: "order.refunded",
      data: { ...polarOrder(), refunded_amount: 0 },
    });
    expect(commissions()[0]?.status).toBe("pending");
  });

  it("never touches a paid commission (logged for the owner)", async () => {
    await paid();
    const row = commissions()[0] as Record<string, unknown>;
    row.status = "paid";
    expect(
      await handleAffiliateWebhook({ type: "refund.created", data: refund() }),
    ).toEqual({ status: "skipped", reason: "already_paid" });
    expect(commissions()[0]?.status).toBe("paid");
  });

  it("an order already refunded when order.paid arrives is recorded void", async () => {
    const result = await paid(polarOrder({ refunded_amount: 1500 }));
    expect(result).toMatchObject({ status: "created", voidReason: "refund" });
    expect(commissions()[0]).toMatchObject({ status: "void", amount: 450 });
  });
});

describe("other events", () => {
  it("are ignored", async () => {
    for (const type of [
      "subscription.active",
      "order.created",
      "checkout.updated",
    ]) {
      expect(await handleAffiliateWebhook({ type, data: {} })).toEqual({
        status: "skipped",
        reason: "ignored_event",
      });
    }
    expect(commissions()).toHaveLength(0);
  });
});

describe("the daily release", () => {
  it("approves pending commissions past their hold, in batches, and nothing else", async () => {
    for (let i = 0; i < 5; i += 1) {
      await paid(
        polarOrder({ id: `order_${i}` }),
        `2026-02-0${i + 1}T00:00:00Z`,
      );
    }
    // The last one is still on hold on 6 March; one was voided.
    (commissions()[0] as Record<string, unknown>).status = "void";
    const released = await releaseHeldCommissions({
      now: new Date("2026-03-06T12:00:00Z"),
      batchSize: 2,
    });
    expect(released).toBe(3);
    expect(commissions().map((row) => row.status)).toEqual([
      "void",
      "approved",
      "approved",
      "approved",
      "pending",
    ]);
  });

  it("stops at its deadline", async () => {
    await paid();
    expect(
      await releaseHeldCommissions({
        now: new Date("2026-12-01T00:00:00Z"),
        deadline: Date.now() - 1,
      }),
    ).toBe(0);
    expect(commissions()[0]?.status).toBe("pending");
  });
});
