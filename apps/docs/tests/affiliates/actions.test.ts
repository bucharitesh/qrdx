// The affiliate program's server actions against the in-memory database.
// Admin (app/admin/affiliates/actions.ts): approve, reject, suspend and
// mark paid ask for the admin's own second factor (requireStrongAdmin) and
// write the admin audit log; mark paid records exactly the signed quote the
// page showed (every currency, converted to US dollars at its rates), only
// from the one US$25 minimum, only to a PayPal address, refuses rather than
// shrink when something changed, and never twice for one PayPal reference.
// Affiliate (app/settings/affiliate/_lib/actions.ts): applying once with a
// random code and the terms version, choosing a code once, and the PayPal
// email only once approved, after "Confirm it's you", with a security email.
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
  payoutNotices: [] as unknown[],
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
vi.mock("@/lib/affiliates/paypal-notice-server", () => ({
  sendPayoutEmailNotice: vi.fn(async (notice: unknown) => {
    state.payoutNotices.push(notice);
  }),
}));
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
          email: state.session?.email ?? state.admin?.email ?? "",
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
  chooseReferralCodeAction,
  getAffiliateApplyState,
  savePaypalEmailAction,
} from "@/app/settings/affiliate/_lib/actions";
import { quotePayout, signPayoutQuote } from "@/lib/affiliates/payout-quote";
import {
  anonymiseAffiliatePayouts,
  loadAffiliateForAdmin,
} from "@/lib/affiliates/program";
import { AFFILIATE_TERMS_VERSION } from "@/lib/affiliates/terms";
import { fakeDb, repoDatabase } from "../support/fake-db";
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
  state.payoutNotices = [];
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

// The ECB's rates as lib/affiliates/exchange-rates.ts returns them.
const RATES = {
  ok: true as const,
  rates: {
    usdPer: { inr: "0.0113636" },
    date: "2026-11-10",
    source: "European Central Bank reference rates",
    sourceUrl: "https://www.ecb.europa.eu/",
  },
};

/** What the admin page hands the Mark paid button, at `shownAt`. */
async function pageQuote(
  shownAt = new Date(),
  rates: Parameters<typeof quotePayout>[0]["rates"] = RATES,
) {
  const loaded = await loadAffiliateForAdmin("aff_1", shownAt);
  if (!(loaded.ready && loaded.value)) throw new Error("no affiliate");
  const quoted = quotePayout({
    affiliateId: "aff_1",
    cutoff: shownAt,
    byCurrency: loaded.value.affiliate.totals.payable,
    rates,
  });
  if (!quoted.ok) throw new Error(quoted.detail);
  return { quote: quoted.quote, token: signPayoutQuote(quoted.quote) };
}

const markPaid = (token: string, paypalReference = "8AB12345CD678901E") =>
  markAffiliatePaidAction({
    affiliateId: "aff_1",
    quote: token,
    paypalReference,
  });

const commission = (id: string) =>
  fakeDb.find("affiliateCommission", { id }) as Record<string, unknown>;

describe("admin: mark paid", () => {
  beforeEach(() => {
    seedAffiliate();
    seedReferral();
  });

  it("records one US-dollar payout for every currency, with the rates, and marks them paid", async () => {
    seedCommission("c1"); // US$15, payable
    seedCommission("c2"); // US$15, payable
    seedCommission("c3", { availableAt: new Date(Date.now() + DAY) }); // on hold
    seedCommission("c4", { currency: "inr", amount: 90_000 }); // ₹900, payable
    seedCommission("c5", { status: "void" });
    const { token } = await pageQuote();
    // ₹900 at 0.0113636 = US$10.227… → US$10.22.
    const result = await markPaid(token);
    expect(result).toEqual({
      ok: true,
      data: { amount: 3000 + 1022, commissions: 3 },
    });
    const [payout] = fakeDb.rows("affiliatePayout");
    expect(payout).toMatchObject({
      affiliateId: "aff_1",
      userId: AFFILIATE_USER.id,
      currency: "usd",
      amount: 4022,
      commissionCount: 3,
      sourceAmounts: { usd: 3000, inr: 90_000 },
      fxRates: { inr: "0.0113636" },
      fxDate: "2026-11-10",
      fxSource: "European Central Bank reference rates",
      paypalEmail: "ana@paypal.example",
      paypalReference: "8AB12345CD678901E",
      createdBy: ADMIN.id,
    });
    for (const id of ["c1", "c2", "c4"]) {
      expect(commission(id)).toMatchObject({
        status: "paid",
        payoutId: payout?.id,
      });
    }
    expect(commission("c3")).toMatchObject({
      status: "pending",
      payoutId: null,
    });
    expect(commission("c5")).toMatchObject({ status: "void" });
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        action: "affiliate.mark_paid",
        targetId: "aff_1",
        metadata: expect.objectContaining({
          currency: "usd",
          amount: 4022,
          fxRates: { inr: "0.0113636" },
          fxDate: "2026-11-10",
          commissions: 3,
          paypalReference: "8AB12345CD678901E",
        }),
      }),
    ]);
  });

  it("records no rates when everything is in US dollars", async () => {
    seedCommission("c1", { amount: 3000 });
    expect(
      await markPaid((await pageQuote(new Date(), null)).token),
    ).toMatchObject({
      ok: true,
    });
    expect(fakeDb.rows("affiliatePayout")[0]).toMatchObject({
      amount: 3000,
      fxRates: null,
      fxDate: null,
    });
  });

  // D-C2: one US$25 minimum across currencies.
  it("pays US$20 and ₹2,000 together once converted, and refuses below US$25", async () => {
    seedCommission("c1", { amount: 2000 });
    seedCommission("c2", { currency: "inr", amount: 200_000 });
    expect(await markPaid((await pageQuote()).token)).toMatchObject({
      ok: true,
      data: { amount: 2000 + 2272, commissions: 2 },
    });

    resetAffiliateDb();
    seedAffiliate();
    seedReferral();
    seedCommission("c3", { amount: 1500 });
    seedCommission("c4", { currency: "inr", amount: 50_000 }); // ≈ US$5.68
    expect(await markPaid((await pageQuote()).token)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/below the minimum payout of US\$25/),
    });
    expect(fakeDb.rows("affiliatePayout")).toEqual([]);
    expect(commission("c3").status).toBe("pending");
  });

  it("allows exactly the minimum", async () => {
    seedCommission("c1", { amount: 2500 });
    expect(await markPaid((await pageQuote()).token)).toMatchObject({
      ok: true,
    });
  });

  it("never converts without a rate: no quote, and no edited one", async () => {
    seedCommission("c1", { amount: 3000 });
    seedCommission("c2", { currency: "inr", amount: 90_000 });
    const loaded = await loadAffiliateForAdmin("aff_1", new Date());
    const byCurrency =
      loaded.ready && loaded.value ? loaded.value.affiliate.totals.payable : {};
    expect(
      quotePayout({
        affiliateId: "aff_1",
        cutoff: new Date(),
        byCurrency,
        rates: { ok: false, reason: "The ECB couldn't be reached." },
      }),
    ).toMatchObject({
      ok: false,
      reason: "no_rate",
      currencies: ["inr"],
      detail: "The ECB couldn't be reached.",
    });
    expect(
      quotePayout({
        affiliateId: "aff_1",
        cutoff: new Date(),
        byCurrency,
        rates: { ...RATES, rates: { ...RATES.rates, usdPer: { eur: "1.1" } } },
      }),
    ).toMatchObject({ ok: false, currencies: ["inr"] });

    // A quote with its rate taken out, or changed, isn't one this server signed.
    const { quote } = await pageQuote();
    const [payload] = signPayoutQuote(quote).split(".");
    const forged = (changes: Record<string, unknown>) =>
      `${Buffer.from(JSON.stringify({ ...quote, ...changes })).toString("base64url")}.${signPayoutQuote(quote).split(".")[1]}`;
    expect(payload).toBeTruthy();
    for (const token of [
      forged({ fxRates: {} }),
      forged({ fxRates: { inr: "0.02" } }),
      forged({ usdTotal: 99_999 }),
      "not-a-token",
    ]) {
      expect(await markPaid(token)).toMatchObject({
        ok: false,
        error: expect.stringMatching(/isn't one this page showed/),
      });
    }
    expect(fakeDb.rows("affiliatePayout")).toEqual([]);
  });

  // B5: pay what the page showed, using the page's moment as the cut-off.
  it("covers only what was payable when the page was shown", async () => {
    const shownAt = new Date(Date.now() - 60 * 60 * 1000);
    seedCommission("c1", { amount: 3000 });
    // Became payable half an hour after the page was shown.
    seedCommission("c2", {
      availableAt: new Date(Date.now() - 30 * 60 * 1000),
    });
    expect(await markPaid((await pageQuote(shownAt)).token)).toMatchObject({
      ok: true,
      data: { amount: 3000, commissions: 1 },
    });
    expect(commission("c2")).toMatchObject({
      status: "pending",
      payoutId: null,
    });
  });

  it("refuses, recording nothing, when what's payable changed since the page loaded", async () => {
    seedCommission("c1");
    seedCommission("c2");
    const { token } = await pageQuote();
    // A refund voids one before the admin clicks.
    commission("c2").status = "void";
    expect(await markPaid(token)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/changed since this page loaded/),
    });
    expect(fakeDb.rows("affiliatePayout")).toEqual([]);
    expect(commission("c1")).toMatchObject({
      status: "pending",
      payoutId: null,
    });
  });

  // B5: a refund landing between the check and the write.
  it("undoes the payout rather than record less than was sent", async () => {
    seedCommission("c1", { amount: 2000 });
    seedCommission("c2", { amount: 2000, status: "approved" });
    const { token } = await pageQuote();
    const database = repoDatabase.database as {
      batch: (queries: PromiseLike<unknown>[]) => Promise<unknown[]>;
    };
    const realBatch = database.batch.bind(database);
    const batch = vi
      .spyOn(database, "batch")
      .mockImplementationOnce(async (queries) => {
        commission("c2").status = "void";
        return realBatch(queries);
      });
    expect(await markPaid(token)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/changed since this page loaded/),
    });
    batch.mockRestore();
    expect(fakeDb.rows("affiliatePayout")).toEqual([]);
    expect(commission("c1")).toMatchObject({
      status: "pending",
      payoutId: null,
    });
    expect(commission("c2")).toMatchObject({ status: "void", payoutId: null });
    expect(auditEntries()).toEqual([]);
  });

  // B5: double "Mark paid".
  it("records a payout once however often it's submitted", async () => {
    seedCommission("c1", { amount: 3000 });
    const { token } = await pageQuote();
    expect(await markPaid(token)).toMatchObject({ ok: true });
    // The same page submitted again, with the same or another reference.
    expect(await markPaid(token)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/changed since this page loaded/),
    });
    expect(await markPaid(token, "9ZZ12345CD678901E")).toMatchObject({
      ok: false,
    });
    expect(fakeDb.rows("affiliatePayout")).toHaveLength(1);
    expect(fakeDb.rows("affiliatePayout")[0]?.amount).toBe(3000);
  });

  it("refuses a PayPal reference that's already recorded, rolling everything back", async () => {
    seedCommission("c1", { amount: 3000 });
    fakeDb.seed("affiliatePayout", [
      {
        id: "payout_old",
        affiliateId: "aff_1",
        userId: AFFILIATE_USER.id,
        currency: "usd",
        amount: 2500,
        commissionCount: 1,
        paypalEmail: "ana@paypal.example",
        paypalReference: "8AB12345CD678901E",
        paidAt: new Date(),
        createdBy: ADMIN.id,
        createdAt: new Date(),
      },
    ]);
    expect(await markPaid((await pageQuote()).token)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already recorded/),
    });
    expect(fakeDb.rows("affiliatePayout")).toHaveLength(1);
    expect(commission("c1")).toMatchObject({
      status: "pending",
      payoutId: null,
    });
  });

  it("refuses a quote that's too old, from the future, or for someone else", async () => {
    seedCommission("c1", { amount: 3000 });
    const old = await pageQuote(new Date(Date.now() - 25 * 60 * 60 * 1000));
    expect(await markPaid(old.token)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/more than a day old/),
    });
    const future = signPayoutQuote({
      ...(await pageQuote()).quote,
      cutoff: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(await markPaid(future)).toMatchObject({ ok: false });
    const other = signPayoutQuote({
      ...(await pageQuote()).quote,
      affiliateId: "aff_2",
    });
    expect(await markPaid(other)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/isn't one this page showed/),
    });
    expect(fakeDb.rows("affiliatePayout")).toEqual([]);
  });

  it("refuses without a PayPal email, or for an affiliate who isn't approved", async () => {
    seedCommission("c1", { amount: 3000 });
    const { token } = await pageQuote();
    (
      fakeDb.find("affiliate", { id: "aff_1" }) as Record<string, unknown>
    ).paypalEmail = null;
    expect(await markPaid(token)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/PayPal email/),
    });
    (
      fakeDb.find("affiliate", { id: "aff_1" }) as Record<string, unknown>
    ).status = "suspended";
    expect(await markPaid(token)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/approved/),
    });
  });

  it("needs the admin's own second factor and a real PayPal reference", async () => {
    seedCommission("c1", { amount: 3000 });
    const { token } = await pageQuote();
    state.adminStrongConfirmation = false;
    expect(await markPaid(token)).toEqual({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
    });
    state.adminStrongConfirmation = true;
    expect(await markPaid(token, "x")).toMatchObject({ ok: false });
    expect(fakeDb.rows("affiliatePayout")).toEqual([]);
  });

  // D-C4: payouts stay for the books when the affiliate deletes their
  // account, without the PayPal address (the ids are set null by the FKs).
  it("keeps payouts, without the PayPal address, when the affiliate's account goes", async () => {
    seedCommission("c1", { amount: 3000 });
    await markPaid((await pageQuote()).token);
    await anonymiseAffiliatePayouts(AFFILIATE_USER.id);
    expect(fakeDb.rows("affiliatePayout")[0]).toMatchObject({
      amount: 3000,
      currency: "usd",
      paypalReference: "8AB12345CD678901E",
      paypalEmail: null,
    });
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

  // D-C3 and B11: a random code, never from the name or email, and the
  // version of the terms accepted.
  it("applies once, pending, with a random code and the terms version", async () => {
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
        termsVersion: AFFILIATE_TERMS_VERSION,
        agreedToTermsAt: expect.any(String),
      }),
    });
    // No PayPal address is asked for, or kept, before approval.
    expect(row?.paypalEmail ?? null).toBe(null);
    expect(String(row?.code)).toMatch(/^[a-hjkmnp-z2-9]{8}$/);
    expect(String(row?.code)).not.toMatch(/ana|diaz/);
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

  // B6: a security email to the account's address, and the time it changed.
  it("emails the account and records when the PayPal email changes", async () => {
    seedAffiliate({ paypalEmail: "old@paypal.example" });
    expect(
      await savePaypalEmailAction({ email: "new@paypal.example" }),
    ).toEqual({ ok: true, data: null });
    await vi.waitFor(() => expect(state.payoutNotices).toHaveLength(1));
    expect(state.payoutNotices[0]).toEqual({
      email: AFFILIATE_USER.email,
      paypalEmail: "new@paypal.example",
      replaced: true,
    });
    expect(
      fakeDb.find("affiliate", { id: "aff_1" })?.paypalEmailChangedAt,
    ).toBeInstanceOf(Date);
    // Saving the same address again changes nothing and sends nothing.
    await savePaypalEmailAction({ email: "new@paypal.example" });
    expect(state.payoutNotices).toHaveLength(1);
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

  // D-C3: an affiliate chooses their own code once; the old one keeps working.
  it("lets an approved affiliate choose their code once, keeping the random one", async () => {
    seedAffiliate({ code: "k7q2mx9p" });
    seedAffiliate({ id: "aff_2", userId: "user_other", code: "taken-one" });
    expect(await chooseReferralCodeAction({ code: "ana-diaz" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/start of your email address/),
    });
    expect(await chooseReferralCodeAction({ code: "admin" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/reserved/),
    });
    expect(await chooseReferralCodeAction({ code: "taken-one" })).toMatchObject(
      {
        ok: false,
        error: expect.stringMatching(/taken/),
      },
    );
    expect(await chooseReferralCodeAction({ code: "Ana-Picks" })).toEqual({
      ok: true,
      data: { code: "ana-picks" },
    });
    expect(fakeDb.find("affiliate", { id: "aff_1" })).toMatchObject({
      code: "ana-picks",
      previousCode: "k7q2mx9p",
      codeChangedAt: expect.any(Date),
    });
    // Once only.
    expect(await chooseReferralCodeAction({ code: "ana-again" })).toMatchObject(
      {
        ok: false,
        error: expect.stringMatching(/only change once/),
      },
    );
    // Nobody else can take the old random code.
    state.session = {
      userId: "user_other",
      name: "Other",
      email: "other@example.com",
    };
    fakeDb.rows("affiliate")[1] = {
      ...fakeDb.rows("affiliate")[1],
      codeChangedAt: null,
      previousCode: null,
    };
    expect(await chooseReferralCodeAction({ code: "k7q2mx9p" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/taken/),
    });
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
