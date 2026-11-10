import "server-only";

import {
  affiliate,
  affiliateCommission,
  affiliatePayout,
  affiliateReferral,
  database as db,
  user,
} from "@repo/database";
import cuid from "cuid";
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { isMissingTableError, noteMissingTables } from "./missing-table";
import {
  type AffiliateStatus,
  type EffectiveCommissionStatus,
  effectiveCommissionStatus,
  parseReferralCode,
  referralCodeStem,
} from "./rules";

// Reads and writes for the affiliate pages (/affiliates, Settings →
// Affiliate program, /admin/affiliates). The webhook's side is
// ./commissions.ts and sign-up's is ./attribution.ts.
//
// Until packages/database/manual-sql/2026-11-10-affiliates.sql is applied,
// every read here hits a missing table: loaders return { ready: false } and
// the pages say the program isn't available yet, instead of failing.

export type AffiliateRow = typeof affiliate.$inferSelect;

export type Loaded<T> = { ready: true; value: T } | { ready: false };

/** Runs a loader; a missing table becomes { ready: false }, anything else throws. */
export async function whenReady<T>(load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ready: true, value: await load() };
  } catch (error) {
    if (noteMissingTables(error)) return { ready: false };
    throw error;
  }
}

export async function getAffiliateForUser(
  userId: string,
): Promise<AffiliateRow | null> {
  const [row] = await db
    .select()
    .from(affiliate)
    .where(eq(affiliate.userId, userId))
    .limit(1);
  return row ?? null;
}

// ─── Applying ────────────────────────────────────────────────────────────────

export interface Application {
  website: string;
  promotion: string;
}

const randomSuffix = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(4)),
    (byte) => "abcdefghjkmnpqrstuvwxyz23456789"[byte % 31],
  ).join("");

/**
 * Saves an application (status pending) with a referral code made from the
 * person's name. Applying again returns the existing row unchanged.
 */
export async function applyForAffiliate(input: {
  userId: string;
  name: string | null;
  application: Application;
  now?: Date;
}): Promise<AffiliateRow> {
  const existing = await getAffiliateForUser(input.userId);
  if (existing) return existing;
  const now = input.now ?? new Date();
  const stem = referralCodeStem(input.name);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = parseReferralCode(`${stem}-${randomSuffix()}`);
    if (!code) continue;
    const inserted = await db
      .insert(affiliate)
      .values({
        id: cuid(),
        userId: input.userId,
        status: "pending",
        code,
        application: {
          website: input.application.website,
          promotion: input.application.promotion,
          agreedToTermsAt: now.toISOString(),
        },
        clickCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) return inserted[0];
    // The same person applying twice at once, or (rarely) a taken code.
    const raced = await getAffiliateForUser(input.userId);
    if (raced) return raced;
  }
  throw new Error("Couldn't pick a free referral code");
}

/**
 * The PayPal address payouts go to. Only an approved affiliate can set it,
 * so the address of someone who wasn't accepted is never stored.
 */
export async function setPaypalEmail(input: {
  userId: string;
  email: string;
  now?: Date;
}): Promise<"saved" | "not_approved"> {
  const updated = await db
    .update(affiliate)
    .set({ paypalEmail: input.email, updatedAt: input.now ?? new Date() })
    .where(
      and(eq(affiliate.userId, input.userId), eq(affiliate.status, "approved")),
    )
    .returning({ id: affiliate.id });
  return updated.length > 0 ? "saved" : "not_approved";
}

// ─── The referral link ──────────────────────────────────────────────────────

/**
 * A visit to /r/<code>: true for an approved affiliate's code, whose click
 * count goes up by one (no cookie, no IP address, nothing about the visitor
 * is stored). Never throws.
 */
export async function recordReferralClick(
  rawCode: string,
  options: { count?: boolean } = {},
): Promise<boolean> {
  const code = parseReferralCode(rawCode);
  if (!code) return false;
  try {
    if (options.count === false) {
      const [row] = await db
        .select({ id: affiliate.id })
        .from(affiliate)
        .where(and(eq(affiliate.code, code), eq(affiliate.status, "approved")))
        .limit(1);
      return Boolean(row);
    }
    const updated = await db
      .update(affiliate)
      .set({ clickCount: sql`${affiliate.clickCount} + 1` })
      .where(and(eq(affiliate.code, code), eq(affiliate.status, "approved")))
      .returning({ id: affiliate.id });
    return updated.length > 0;
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error(
        JSON.stringify({
          event: "affiliates.click_failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } else {
      noteMissingTables(error);
    }
    return false;
  }
}

// ─── Money, per currency ────────────────────────────────────────────────────

export type ByCurrency = Record<string, number>;

export interface MoneyTotals {
  pending: ByCurrency;
  payable: ByCurrency;
  paid: ByCurrency;
}

export interface CommissionView {
  id: string;
  currency: string;
  amount: number;
  orderAmount: number;
  rateBps: number;
  status: EffectiveCommissionStatus;
  voidReason: string | null;
  orderPaidAt: Date;
  availableAt: Date;
  payoutId: string | null;
  polarOrderId: string;
  referredUserId: string | null;
}

type CommissionRow = Omit<CommissionView, "status"> & { status: string };

function addTo(target: ByCurrency, currency: string, amount: number) {
  const key = currency.toLowerCase();
  target[key] = (target[key] ?? 0) + amount;
}

export function totalsOf(
  rows: readonly CommissionRow[],
  now: Date,
): MoneyTotals {
  const totals: MoneyTotals = { pending: {}, payable: {}, paid: {} };
  for (const row of rows) {
    const status = effectiveCommissionStatus(row, now);
    if (status === "void") continue;
    addTo(totals[status], row.currency, row.amount);
  }
  return totals;
}

const commissionColumns = {
  id: affiliateCommission.id,
  currency: affiliateCommission.currency,
  amount: affiliateCommission.amount,
  orderAmount: affiliateCommission.orderAmount,
  rateBps: affiliateCommission.rateBps,
  status: affiliateCommission.status,
  voidReason: affiliateCommission.voidReason,
  orderPaidAt: affiliateCommission.orderPaidAt,
  availableAt: affiliateCommission.availableAt,
  payoutId: affiliateCommission.payoutId,
  polarOrderId: affiliateCommission.polarOrderId,
  referredUserId: affiliateCommission.referredUserId,
};

async function commissionsOf(affiliateId: string): Promise<CommissionRow[]> {
  return db
    .select(commissionColumns)
    .from(affiliateCommission)
    .where(eq(affiliateCommission.affiliateId, affiliateId))
    .orderBy(desc(affiliateCommission.orderPaidAt));
}

export type PayoutRow = typeof affiliatePayout.$inferSelect;

async function payoutsOf(affiliateId: string): Promise<PayoutRow[]> {
  return db
    .select()
    .from(affiliatePayout)
    .where(eq(affiliatePayout.affiliateId, affiliateId))
    .orderBy(desc(affiliatePayout.paidAt));
}

async function referralCounts(affiliateId: string) {
  const [signUps] = await db
    .select({ total: count() })
    .from(affiliateReferral)
    .where(eq(affiliateReferral.affiliateId, affiliateId));
  const [paying] = await db
    .select({ total: count() })
    .from(affiliateReferral)
    .where(
      and(
        eq(affiliateReferral.affiliateId, affiliateId),
        isNotNull(affiliateReferral.firstPaidAt),
      ),
    );
  return {
    signUps: Number(signUps?.total ?? 0),
    payingCustomers: Number(paying?.total ?? 0),
  };
}

// ─── The affiliate's dashboard ──────────────────────────────────────────────

export interface AffiliateDashboard {
  affiliate: AffiliateRow | null;
  clicks: number;
  signUps: number;
  payingCustomers: number;
  totals: MoneyTotals;
  commissions: CommissionView[];
  payouts: PayoutRow[];
}

/** Settings → Affiliate program. `affiliate` is null for someone who hasn't applied. */
export async function loadAffiliateDashboard(
  userId: string,
  now = new Date(),
): Promise<Loaded<AffiliateDashboard>> {
  return whenReady(async () => {
    const row = await getAffiliateForUser(userId);
    const empty: AffiliateDashboard = {
      affiliate: row,
      clicks: row?.clickCount ?? 0,
      signUps: 0,
      payingCustomers: 0,
      totals: { pending: {}, payable: {}, paid: {} },
      commissions: [],
      payouts: [],
    };
    if (!row || row.status === "pending" || row.status === "rejected") {
      return empty;
    }
    const [counts, commissions, payouts] = await Promise.all([
      referralCounts(row.id),
      commissionsOf(row.id),
      payoutsOf(row.id),
    ]);
    return {
      ...empty,
      ...counts,
      totals: totalsOf(commissions, now),
      commissions: commissions.map((commission) => ({
        ...commission,
        status: effectiveCommissionStatus(commission, now),
      })),
      payouts,
    };
  });
}

// ─── Admin ──────────────────────────────────────────────────────────────────

export interface AdminAffiliateRow {
  id: string;
  userId: string;
  email: string;
  name: string;
  status: AffiliateStatus;
  code: string;
  paypalEmail: string | null;
  application: Record<string, string> | null;
  clickCount: number;
  createdAt: Date;
  approvedAt: Date | null;
  statusNote: string | null;
  signUps: number;
  payingCustomers: number;
  totals: MoneyTotals;
}

/** Every affiliate with what's owed, newest first (applications included). */
export async function listAffiliatesForAdmin(
  now = new Date(),
): Promise<Loaded<AdminAffiliateRow[]>> {
  return whenReady(async () => {
    const rows = await db
      .select({
        id: affiliate.id,
        userId: affiliate.userId,
        email: user.email,
        name: user.name,
        status: affiliate.status,
        code: affiliate.code,
        paypalEmail: affiliate.paypalEmail,
        application: affiliate.application,
        clickCount: affiliate.clickCount,
        createdAt: affiliate.createdAt,
        approvedAt: affiliate.approvedAt,
        statusNote: affiliate.statusNote,
      })
      .from(affiliate)
      .innerJoin(user, eq(user.id, affiliate.userId))
      .orderBy(desc(affiliate.createdAt));
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [commissions, referrals] = await Promise.all([
      db
        .select({
          affiliateId: affiliateCommission.affiliateId,
          ...commissionColumns,
        })
        .from(affiliateCommission)
        .where(inArray(affiliateCommission.affiliateId, ids)),
      db
        .select({
          affiliateId: affiliateReferral.affiliateId,
          firstPaidAt: affiliateReferral.firstPaidAt,
        })
        .from(affiliateReferral)
        .where(inArray(affiliateReferral.affiliateId, ids)),
    ]);
    return rows.map((row) => {
      const own = referrals.filter((ref) => ref.affiliateId === row.id);
      return {
        ...row,
        status: row.status as AffiliateStatus,
        signUps: own.length,
        payingCustomers: own.filter((ref) => ref.firstPaidAt).length,
        totals: totalsOf(
          commissions.filter((c) => c.affiliateId === row.id),
          now,
        ),
      };
    });
  });
}

export interface AdminAffiliateDetail {
  affiliate: AdminAffiliateRow;
  commissions: CommissionView[];
  payouts: PayoutRow[];
}

export async function loadAffiliateForAdmin(
  affiliateId: string,
  now = new Date(),
): Promise<Loaded<AdminAffiliateDetail | null>> {
  return whenReady(async () => {
    const [row] = await db
      .select({
        id: affiliate.id,
        userId: affiliate.userId,
        email: user.email,
        name: user.name,
        status: affiliate.status,
        code: affiliate.code,
        paypalEmail: affiliate.paypalEmail,
        application: affiliate.application,
        clickCount: affiliate.clickCount,
        createdAt: affiliate.createdAt,
        approvedAt: affiliate.approvedAt,
        statusNote: affiliate.statusNote,
      })
      .from(affiliate)
      .innerJoin(user, eq(user.id, affiliate.userId))
      .where(eq(affiliate.id, affiliateId))
      .limit(1);
    if (!row) return null;
    const [counts, commissions, payouts] = await Promise.all([
      referralCounts(row.id),
      commissionsOf(row.id),
      payoutsOf(row.id),
    ]);
    return {
      affiliate: {
        ...row,
        status: row.status as AffiliateStatus,
        ...counts,
        totals: totalsOf(commissions, now),
      },
      commissions: commissions.map((commission) => ({
        ...commission,
        status: effectiveCommissionStatus(commission, now),
      })),
      payouts,
    };
  });
}

// ─── Data export ────────────────────────────────────────────────────────────

/**
 * For Settings → Download my data (lib/account/export): the person's
 * affiliate account with its commissions and payouts, and whether their own
 * account was referred. Null before the tables exist or when there's
 * nothing, so the export never fails on them.
 */
export async function exportAffiliateData(userId: string) {
  try {
    const row = await getAffiliateForUser(userId);
    const [referred] = await db
      .select({
        attributedVia: affiliateReferral.attributedVia,
        referredAt: affiliateReferral.createdAt,
        firstPaidAt: affiliateReferral.firstPaidAt,
      })
      .from(affiliateReferral)
      .where(eq(affiliateReferral.referredUserId, userId))
      .limit(1);
    if (!(row || referred)) return null;
    const [commissions, payouts] = row
      ? await Promise.all([commissionsOf(row.id), payoutsOf(row.id)])
      : [[], []];
    return {
      affiliate: row
        ? {
            status: row.status,
            code: row.code,
            paypalEmail: row.paypalEmail,
            application: row.application,
            linkVisits: row.clickCount,
            appliedAt: row.createdAt,
            approvedAt: row.approvedAt,
            commissions: commissions.map((commission) => ({
              orderPaidAt: commission.orderPaidAt,
              currency: commission.currency,
              orderAmount: commission.orderAmount,
              rateBps: commission.rateBps,
              amount: commission.amount,
              status: commission.status,
              voidReason: commission.voidReason,
              availableAt: commission.availableAt,
            })),
            payouts: payouts.map((payout) => ({
              paidAt: payout.paidAt,
              currency: payout.currency,
              amount: payout.amount,
              paypalEmail: payout.paypalEmail,
              paypalReference: payout.paypalReference,
            })),
          }
        : null,
      // That an affiliate referred this account, never which one.
      referredByAnAffiliate: referred ?? null,
    };
  } catch (error) {
    if (noteMissingTables(error)) return null;
    throw error;
  }
}

/** The commissions a payout in `currency` would cover now, and their total. */
export async function payableCommissions(
  affiliateId: string,
  currency: string,
  now = new Date(),
): Promise<{ ids: string[]; total: number }> {
  const rows = await commissionsOf(affiliateId);
  const due = rows.filter(
    (row) =>
      row.currency.toLowerCase() === currency.toLowerCase() &&
      effectiveCommissionStatus(row, now) === "payable",
  );
  return {
    ids: due.map((row) => row.id),
    total: due.reduce((sum, row) => sum + row.amount, 0),
  };
}
