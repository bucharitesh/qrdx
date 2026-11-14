// Shared fixtures for the affiliate tests: the unique keys the real schema
// has (packages/database/schema.ts), and a few people. Nothing here is real.
import { fakeDb } from "../support/fake-db";

export const AFFILIATE_USER = {
  id: "user_affiliate",
  email: "ana.diaz@gmail.com",
  name: "Ana Diaz",
};
export const CUSTOMER = {
  id: "user_customer",
  email: "bob@example.com",
  name: "Bob",
};

export function resetAffiliateDb() {
  fakeDb.resetAll();
  fakeDb.unique("affiliate", "id");
  fakeDb.unique("affiliate", "userId");
  fakeDb.unique("affiliate", "code");
  fakeDb.unique("affiliateReferral", "id");
  fakeDb.unique("affiliateReferral", "referredUserId");
  fakeDb.unique("affiliateCommission", "id");
  fakeDb.unique("affiliateCommission", "polarOrderId");
  fakeDb.unique("affiliate", "previousCode");
  fakeDb.unique("affiliatePayout", "id");
  // One payout per PayPal transaction (affiliate_payout_paypal_reference_unique).
  fakeDb.unique("affiliatePayout", "paypalReference");
  fakeDb.unique("affiliateRefundedOrder", "polarOrderId");
  fakeDb.unique("subscription", "id");
  fakeDb.unique("member", "organizationId", "userId");
  const at = new Date("2026-01-01T00:00:00Z");
  fakeDb.seed("user", [
    { ...AFFILIATE_USER, emailVerified: true, createdAt: at, updatedAt: at },
    { ...CUSTOMER, emailVerified: true, createdAt: at, updatedAt: at },
  ]);
}

export function seedAffiliate(
  overrides: Partial<{
    id: string;
    userId: string;
    status: string;
    code: string;
    previousCode: string | null;
    codeChangedAt: Date | null;
    paypalEmail: string | null;
    paypalEmailChangedAt: Date | null;
  }> = {},
) {
  const at = new Date("2026-01-01T00:00:00Z");
  const row = {
    id: "aff_1",
    userId: AFFILIATE_USER.id,
    status: "approved",
    code: "ana-diaz-4k2p",
    previousCode: null,
    codeChangedAt: null,
    paypalEmail: "ana@paypal.example",
    paypalEmailChangedAt: null,
    application: { website: "", promotion: "A newsletter for restaurants" },
    clickCount: 0,
    approvedAt: at,
    approvedBy: "admin_1",
    reviewedAt: at,
    reviewedBy: "admin_1",
    statusNote: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
  fakeDb.seed("affiliate", [row]);
  return row;
}

export function seedReferral(
  overrides: Partial<{
    id: string;
    affiliateId: string;
    referredUserId: string;
    firstPaidAt: Date | null;
  }> = {},
) {
  const row = {
    id: "ref_1",
    affiliateId: "aff_1",
    referredUserId: CUSTOMER.id,
    attributedVia: "link",
    firstPaidAt: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
  fakeDb.seed("affiliateReferral", [row]);
  return row;
}

/** A Polar order as order.paid sends it (only the fields the code reads). */
export function polarOrder(
  overrides: Partial<{
    id: string;
    net_amount: number;
    refunded_amount: number;
    currency: string;
    external_id: string | null;
    email: string | null;
    created_at: string;
    paid: boolean;
  }> = {},
) {
  const {
    external_id = CUSTOMER.id,
    email = CUSTOMER.email,
    ...rest
  } = overrides;
  return {
    id: "order_1",
    created_at: "2026-02-01T12:00:00Z",
    modified_at: "2026-02-01T12:00:05Z",
    status: "paid",
    paid: true,
    net_amount: 1500,
    refunded_amount: 0,
    currency: "usd",
    customer_id: "polar_customer_1",
    customer: { external_id, email },
    ...rest,
  };
}
