// The affiliate program's server actions against the in-memory database.
// Admin (app/admin/affiliates/actions.ts): approve, reject, suspend and
// mark paid ask for the admin's own second factor (requireStrongAdmin) and
// write the admin audit log; mark paid only covers payable commissions in
// one currency, only from the minimum, only for the total the page showed,
// and only to a PayPal address. Affiliate (app/settings/affiliate/_lib/
// actions.ts): applying once, and the PayPal email only once approved and
// after "Confirm it's you".
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  admin: null as null | {
    id: string;
    email: string;
    name: string;
    role: string;
  },
  adminTwoFactor: true,
  adminStrongConfirmation: true,
  session: null as null | { userId: string; name: string; email: string },
  recentConfirmation: true,
}));

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
vi.mock("@/app/admin/_lib/guard", () => ({
  assertAdmin: vi.fn(async () => {
    if (!state.admin) throw new Error("Not found");
    return state.admin;
  }),
  requireAdmin: vi.fn(),
  getAdminUser: vi.fn(async () => state.admin),
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
  slidingWindow: () => ({}),
  redis: null,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/account/two-factor-server", () => ({
  twoFactorEnabledFor: vi.fn(async () => state.adminTwoFactor),
}));
vi.mock("@/lib/account/confirmation-server", () => ({
  currentSession: vi.fn(async () => {
    const userId = state.admin?.id ?? state.session?.userId;
    return userId
      ? {
          userId,
          sessionId: "session_1",
          sessionCreatedAt: new Date(),
          held: false,
        }
      : null;
  }),
  hasRecentStrongConfirmation: vi.fn(async () => state.adminStrongConfirmation),
  requireRecentConfirmation: vi.fn(async () =>
    state.recentConfirmation
      ? null
      : { ok: false, error: "CONFIRMATION_REQUIRED" },
  ),
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.session
          ? {
              user: {
                id: state.session.userId,
                name: state.session.name,
                email: state.session.email,
              },
            }
          : null,
    },
  },
}));

import {
  approveAffiliateAction,
  markAffiliatePaidAction,
  rejectAffiliateAction,
  suspendAffiliateAction,
  voidCommissionAction,
} from "@/app/admin/affiliates/actions";
import {
  applyForAffiliateAction,
  getAffiliateApplyState,
  savePaypalEmailAction,
} from "@/app/settings/affiliate/_lib/actions";
import { fakeDb } from "../support/fake-db";
import {
  AFFILIATE_USER,
  CUSTOMER,
  resetAffiliateDb,
  seedAffiliate,
  seedReferral,
} from "./seed";

const DAY = 24 * 60 * 60 * 1000;
const ADMIN = {
  id: "admin_1",
  email: "owner@qrdx.test",
  name: "Owner",
  role: "admin",
};

function seedCommission(
  id: string,
  overrides: Partial<{
    amount: number;
    currency: string;
    status: string;
    availableAt: Date;
    payoutId: string | null;
  }> = {},
) {
  const paidAt = new Date(Date.now() - 40 * DAY);
  fakeDb.seed("affiliateCommission", [
    {
      id,
      affiliateId: "aff_1",
      referralId: "ref_1",
      referredUserId: CUSTOMER.id,
      polarOrderId: `order_${id}`,
      polarCustomerId: "polar_customer_1",
      currency: "usd",
      orderAmount: 5000,
      rateBps: 3000,
      amount: 1500,
      status: "pending",
      orderPaidAt: paidAt,
      availableAt: new Date(paidAt.getTime() + 30 * DAY),
      voidedAt: null,
      voidReason: null,
      voidRefundId: null,
      payoutId: null,
      createdAt: paidAt,
      updatedAt: paidAt,
      ...overrides,
    },
  ]);
}

const auditEntries = () => fakeDb.rows("adminAuditLog");

beforeEach(() => {
  resetAffiliateDb();
  state.admin = ADMIN;
  state.adminTwoFactor = true;
  state.adminStrongConfirmation = true;
  state.session = null;
  state.recentConfirmation = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("admin: approving and rejecting", () => {
  it("approves an application, records who and when, and audits it", async () => {
    seedAffiliate({ status: "pending" });
    expect(await approveAffiliateAction({ affiliateId: "aff_1" })).toEqual({
      ok: true,
    });
    expect(fakeDb.find("affiliate", { id: "aff_1" })).toMatchObject({
      status: "approved",
      approvedBy: ADMIN.id,
      reviewedBy: ADMIN.id,
    });
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        actorUserId: ADMIN.id,
        action: "affiliate.approve",
        targetType: "affiliate",
        targetId: "aff_1",
        metadata: expect.objectContaining({
          subjectUserId: AFFILIATE_USER.id,
          code: "ana-diaz-4k2p",
          from: "pending",
        }),
      }),
    ]);
  });

  it("asks for the admin's own second factor first", async () => {
    seedAffiliate({ status: "pending" });
    state.adminTwoFactor = false;
    expect(
      await approveAffiliateAction({ affiliateId: "aff_1" }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/two-step verification/),
    });
    state.adminTwoFactor = true;
    state.adminStrongConfirmation = false;
    expect(await approveAffiliateAction({ affiliateId: "aff_1" })).toEqual({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
    });
    expect(fakeDb.find("affiliate", { id: "aff_1" })?.status).toBe("pending");
    expect(auditEntries()).toEqual([]);
  });

  it("refuses anyone who isn't an admin before touching anything", async () => {
    seedAffiliate({ status: "pending" });
    state.admin = null;
    await expect(
      approveAffiliateAction({ affiliateId: "aff_1" }),
    ).rejects.toThrow("Not found");
    expect(fakeDb.find("affiliate", { id: "aff_1" })?.status).toBe("pending");
  });

  it("rejects with a reason and keeps no PayPal address", async () => {
    seedAffiliate({ status: "pending", paypalEmail: null });
    expect(
      await rejectAffiliateAction({
        affiliateId: "aff_1",
        reason: "Coupon site",
      }),
    ).toEqual({ ok: true });
    expect(fakeDb.find("affiliate", { id: "aff_1" })).toMatchObject({
      status: "rejected",
      paypalEmail: null,
      statusNote: "Coupon site",
    });
    expect(auditEntries()[0]).toMatchObject({
      action: "affiliate.reject",
      metadata: expect.objectContaining({ reason: "Coupon site" }),
    });
  });

  it("suspends an approved affiliate with a reason", async () => {
    seedAffiliate();
    expect(
      await suspendAffiliateAction({
        affiliateId: "aff_1",
        reason: "Spam reports",
      }),
    ).toEqual({ ok: true });
    expect(fakeDb.find("affiliate", { id: "aff_1" })?.status).toBe("suspended");
  });
});

describe("admin: mark paid", () => {
  beforeEach(() => {
    seedAffiliate();
    seedReferral();
  });

  it("records the payout and marks every payable commission in that currency paid", async () => {
    seedCommission("c1"); // US$15, payable
    seedCommission("c2"); // US$15, payable
    seedCommission("c3", { availableAt: new Date(Date.now() + DAY) }); // on hold
    seedCommission("c4", { currency: "inr", amount: 5970 }); // another currency
    seedCommission("c5", { status: "void" });
    const result = await markAffiliatePaidAction({
      affiliateId: "aff_1",
      currency: "usd",
      amount: 3000,
      paypalReference: "8AB12345CD678901E",
    });
    expect(result).toEqual({
      ok: true,
      data: { amount: 3000, commissions: 2 },
    });
    const [payout] = fakeDb.rows("affiliatePayout");
    expect(payout).toMatchObject({
      affiliateId: "aff_1",
      currency: "usd",
      amount: 3000,
      commissionCount: 2,
      paypalEmail: "ana@paypal.example",
      paypalReference: "8AB12345CD678901E",
      createdBy: ADMIN.id,
    });
    const status = (id: string) =>
      fakeDb.find("affiliateCommission", { id }) as Record<string, unknown>;
    expect(status("c1")).toMatchObject({
      status: "paid",
      payoutId: payout?.id,
    });
    expect(status("c2")).toMatchObject({
      status: "paid",
      payoutId: payout?.id,
    });
    expect(status("c3")).toMatchObject({ status: "pending", payoutId: null });
    expect(status("c4")).toMatchObject({ status: "pending", payoutId: null });
    expect(status("c5")).toMatchObject({ status: "void" });
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        action: "affiliate.mark_paid",
        targetId: "aff_1",
        metadata: expect.objectContaining({
          currency: "usd",
          amount: 3000,
          commissions: 2,
          paypalReference: "8AB12345CD678901E",
        }),
      }),
    ]);
  });

  it("refuses below the US$25 minimum", async () => {
    seedCommission("c1"); // US$15
    const result = await markAffiliatePaidAction({
      affiliateId: "aff_1",
      currency: "usd",
      amount: 1500,
      paypalReference: "8AB12345CD678901E",
    });
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/below the minimum payout of US\$25/),
    });
    expect(fakeDb.rows("affiliatePayout")).toEqual([]);
    expect(fakeDb.find("affiliateCommission", { id: "c1" })?.status).toBe(
      "pending",
    );
  });

  it("allows exactly the minimum", async () => {
    seedCommission("c1", { amount: 2500 });
    expect(
      await markAffiliatePaidAction({
        affiliateId: "aff_1",
        currency: "usd",
        amount: 2500,
        paypalReference: "8AB12345CD678901E",
      }),
    ).toMatchObject({ ok: true });
  });

  it("refuses when the payable total changed since the page loaded", async () => {
    seedCommission("c1");
    seedCommission("c2");
    const result = await markAffiliatePaidAction({
      affiliateId: "aff_1",
      currency: "usd",
      amount: 4500,
      paypalReference: "8AB12345CD678901E",
    });
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/now US\$30, not US\$45/),
    });
    expect(fakeDb.rows("affiliatePayout")).toEqual([]);
  });

  it("refuses without a PayPal email, or for an affiliate who isn't approved", async () => {
    seedCommission("c1", { amount: 3000 });
    (
      fakeDb.find("affiliate", { id: "aff_1" }) as Record<string, unknown>
    ).paypalEmail = null;
    expect(
      await markAffiliatePaidAction({
        affiliateId: "aff_1",
        currency: "usd",
        amount: 3000,
        paypalReference: "8AB12345CD678901E",
      }),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/PayPal email/),
    });
    (
      fakeDb.find("affiliate", { id: "aff_1" }) as Record<string, unknown>
    ).status = "suspended";
    expect(
      await markAffiliatePaidAction({
        affiliateId: "aff_1",
        currency: "usd",
        amount: 3000,
        paypalReference: "8AB12345CD678901E",
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/approved/) });
  });

  it("needs the admin's own second factor and a real PayPal reference", async () => {
    seedCommission("c1", { amount: 3000 });
    state.adminStrongConfirmation = false;
    expect(
      await markAffiliatePaidAction({
        affiliateId: "aff_1",
        currency: "usd",
        amount: 3000,
        paypalReference: "8AB12345CD678901E",
      }),
    ).toEqual({ ok: false, error: "CONFIRMATION_REQUIRED" });
    state.adminStrongConfirmation = true;
    expect(
      await markAffiliatePaidAction({
        affiliateId: "aff_1",
        currency: "usd",
        amount: 3000,
        paypalReference: "x",
      }),
    ).toMatchObject({ ok: false });
    expect(fakeDb.rows("affiliatePayout")).toEqual([]);
  });

  it("pays rupee commissions on their own, from ₹2,200", async () => {
    seedCommission("c1", { currency: "inr", amount: 219_999 });
    expect(
      await markAffiliatePaidAction({
        affiliateId: "aff_1",
        currency: "inr",
        amount: 219_999,
        paypalReference: "8AB12345CD678901E",
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/₹2,200/) });
  });
});

describe("admin: void", () => {
  it("voids an unpaid commission and audits it, but never a paid one", async () => {
    seedAffiliate();
    seedCommission("c1");
    seedCommission("c2", { status: "paid", payoutId: "p1" });
    expect(
      await voidCommissionAction({
        commissionId: "c1",
        reason: "Lost dispute",
      }),
    ).toEqual({ ok: true });
    expect(fakeDb.find("affiliateCommission", { id: "c1" })).toMatchObject({
      status: "void",
      voidReason: "admin",
    });
    expect(
      await voidCommissionAction({
        commissionId: "c2",
        reason: "Lost dispute",
      }),
    ).toMatchObject({ ok: false });
    expect(auditEntries().map((entry) => entry.action)).toEqual([
      "affiliate_commission.void",
    ]);
  });
});

describe("affiliate: applying and the PayPal email", () => {
  beforeEach(() => {
    state.admin = null;
    state.session = {
      userId: AFFILIATE_USER.id,
      name: AFFILIATE_USER.name,
      email: AFFILIATE_USER.email,
    };
  });

  const application = {
    website: "https://ana.example",
    promotion: "A weekly newsletter for restaurant owners.",
    agree: true as const,
  };

  it("applies once, pending, with a code from the name", async () => {
    expect(await getAffiliateApplyState()).toEqual({
      signedIn: true,
      ready: true,
      status: null,
    });
    const first = await applyForAffiliateAction(application);
    expect(first).toEqual({ ok: true, data: { status: "pending" } });
    const [row] = fakeDb.rows("affiliate");
    expect(row).toMatchObject({
      userId: AFFILIATE_USER.id,
      status: "pending",
      application: expect.objectContaining({
        website: "https://ana.example",
        promotion: application.promotion,
      }),
    });
    // No PayPal address is asked for, or kept, before approval.
    expect(row?.paypalEmail ?? null).toBe(null);
    expect(String(row?.code)).toMatch(/^ana-diaz-[a-z0-9]{4}$/);
    await applyForAffiliateAction(application);
    expect(fakeDb.rows("affiliate")).toHaveLength(1);
  });

  it("needs the terms accepted and a real answer", async () => {
    expect(
      await applyForAffiliateAction({ ...application, agree: false as never }),
    ).toMatchObject({ ok: false });
    expect(
      await applyForAffiliateAction({ ...application, promotion: "ads" }),
    ).toMatchObject({ ok: false });
    expect(fakeDb.rows("affiliate")).toEqual([]);
  });

  it("keeps a PayPal email only for an approved affiliate", async () => {
    seedAffiliate({ status: "pending", paypalEmail: null });
    expect(
      await savePaypalEmailAction({ email: "ana@paypal.example" }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/approved/) });
    expect(fakeDb.find("affiliate", { id: "aff_1" })?.paypalEmail).toBe(null);
    (
      fakeDb.find("affiliate", { id: "aff_1" }) as Record<string, unknown>
    ).status = "approved";
    expect(
      await savePaypalEmailAction({ email: " Ana@PayPal.example " }),
    ).toEqual({ ok: true, data: null });
    expect(fakeDb.find("affiliate", { id: "aff_1" })?.paypalEmail).toBe(
      "ana@paypal.example",
    );
  });

  it("asks 'Confirm it's you' before changing where payouts go", async () => {
    seedAffiliate({ paypalEmail: "old@paypal.example" });
    state.recentConfirmation = false;
    expect(
      await savePaypalEmailAction({ email: "new@paypal.example" }),
    ).toEqual({ ok: false, error: "CONFIRMATION_REQUIRED" });
    expect(fakeDb.find("affiliate", { id: "aff_1" })?.paypalEmail).toBe(
      "old@paypal.example",
    );
  });

  it("asks a signed-out visitor to sign in", async () => {
    state.session = null;
    expect(await getAffiliateApplyState()).toMatchObject({ signedIn: false });
    expect(await applyForAffiliateAction(application)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Sign in/),
    });
  });

  it("says 'not ready' instead of failing before the tables exist", async () => {
    fakeDb.missing("affiliate");
    expect(await getAffiliateApplyState()).toEqual({
      signedIn: true,
      ready: false,
      status: null,
    });
    expect(await applyForAffiliateAction(application)).toEqual({
      ok: false,
      error: "The affiliate program isn't available yet.",
    });
  });
});
