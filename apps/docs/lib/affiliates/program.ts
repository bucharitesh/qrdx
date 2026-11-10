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
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { isMissingTableError, noteMissingTables } from "./missing-table";
import {
  type AffiliateStatus,
  type ChosenCodeProblem,
  checkChosenCode,
  type EffectiveCommissionStatus,
  effectiveCommissionStatus,
  isPayable,
  parseReferralCode,
  randomReferralCode,
  sumByCurrency,
} from "./rules";
import { AFFILIATE_TERMS_VERSION } from "./terms";

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

/** Whether a code is anyone's, current or from before they chose one. */
async function codeInUse(code: string): Promise<boolean> {
  const [row] = await db
    .select({ id: affiliate.id })
    .from(affiliate)
    .where(or(eq(affiliate.code, code), eq(affiliate.previousCode, code)))
    .limit(1);
  return Boolean(row);
}

/**
 * Saves an application (status pending) with a random referral code, never
 * one made from the person's name or email address, and the version of the
 * terms they accepted. Applying again returns the existing row unchanged.
 */
export async function applyForAffiliate(input: {
  userId: string;
  application: Application;
  now?: Date;
  randomCode?: () => string;
}): Promise<AffiliateRow> {
  const existing = await getAffiliateForUser(input.userId);
  if (existing) return existing;
  const now = input.now ?? new Date();
  const nextCode = input.randomCode ?? (() => randomReferralCode());
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = parseReferralCode(nextCode());
    if (!code || (await codeInUse(code))) continue;
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
          termsVersion: AFFILIATE_TERMS_VERSION,
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

export type ChooseCodeResult =
  | { status: "saved"; code: string; previousCode: string }
  | {
      status:
        | ChosenCodeProblem
        | "taken"
        | "already_changed"
        | "not_approved"
        | "unchanged";
    };

/**
 * An approved affiliate picks their own code, once: it must pass
 * checkChosenCode (format, reserved words, not their email's local part)
 * and be nobody's code, current or previous. Their random code moves to
 * previous_code and keeps working, so links already shared still count.
 */
export async function chooseReferralCode(input: {
  userId: string;
  code: unknown;
  ownEmails: readonly string[];
  now?: Date;
}): Promise<ChooseCodeResult> {
  const checked = checkChosenCode(input.code, input.ownEmails);
  if (!checked.ok) return { status: checked.problem };
  const row = await getAffiliateForUser(input.userId);
  if (row?.status !== "approved") return { status: "not_approved" };
  if (row.codeChangedAt || row.previousCode) {
    return { status: "already_changed" };
  }
  if (checked.code === row.code) return { status: "unchanged" };
  if (await codeInUse(checked.code)) return { status: "taken" };
  const now = input.now ?? new Date();
  try {
    const updated = await db
      .update(affiliate)
      .set({
        code: checked.code,
        previousCode: row.code,
        codeChangedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(affiliate.id, row.id),
          eq(affiliate.code, row.code),
          isNull(affiliate.codeChangedAt),
        ),
      )
      .returning({ id: affiliate.id });
    if (updated.length === 0) return { status: "already_changed" };
  } catch (error) {
    // Someone took it in the same moment (the unique constraint).
    if ((error as { code?: string })?.code === "23505") {
      return { status: "taken" };
    }
    throw error;
  }
  return { status: "saved", code: checked.code, previousCode: row.code };
}

/**
 * The PayPal address payouts go to. Only an approved affiliate can set it,
 * so the address of someone who wasn't accepted is never stored.
 */
export async function setPaypalEmail(input: {
  userId: string;
  email: string;
  now?: Date;
}): Promise<
  | { status: "saved"; previous: string | null }
  | { status: "unchanged" | "not_approved" }
> {
  const row = await getAffiliateForUser(input.userId);
  if (row?.status !== "approved") return { status: "not_approved" };
  if (row.paypalEmail === input.email) return { status: "unchanged" };
  const now = input.now ?? new Date();
  const updated = await db
    .update(affiliate)
    .set({
      paypalEmail: input.email,
      paypalEmailChangedAt: now,
      updatedAt: now,
    })
    .where(
      and(eq(affiliate.userId, input.userId), eq(affiliate.status, "approved")),
    )
    .returning({ id: affiliate.id });
  return updated.length > 0
    ? { status: "saved", previous: row.paypalEmail }
    : { status: "not_approved" };
}

// ─── The referral link ──────────────────────────────────────────────────────

/**
 * A visit to /r/<code>: the code to carry to sign-up (the affiliate's
 * current one, also for a link with their earlier random code) when it's an
 * approved affiliate's, whose click count goes up by one; else null. No
 * cookie, no IP address, nothing about the visitor is stored. Never throws.
 */
export async function recordReferralClick(
  rawCode: string,
  options: { count?: boolean } = {},
): Promise<string | null> {
  const code = parseReferralCode(rawCode);
  if (!code) return null;
  const approvedWithCode = and(
    or(eq(affiliate.code, code), eq(affiliate.previousCode, code)),
    eq(affiliate.status, "approved"),
  );
  try {
    if (options.count === false) {
      const [row] = await db
        .select({ code: affiliate.code })
        .from(affiliate)
        .where(approvedWithCode)
        .limit(1);
      return row?.code ?? null;
    }
    const [updated] = await db
      .update(affiliate)
      .set({ clickCount: sql`${affiliate.clickCount} + 1` })
      .where(approvedWithCode)
      .returning({ code: affiliate.code });
    return updated?.code ?? null;
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
    return null;
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
  previousCode: string | null;
  paypalEmail: string | null;
  paypalEmailChangedAt: Date | null;
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
        previousCode: affiliate.previousCode,
        paypalEmail: affiliate.paypalEmail,
        paypalEmailChangedAt: affiliate.paypalEmailChangedAt,
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
        previousCode: affiliate.previousCode,
        paypalEmail: affiliate.paypalEmail,
        paypalEmailChangedAt: affiliate.paypalEmailChangedAt,
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
            previousCode: row.previousCode,
            codeChosenAt: row.codeChangedAt,
            paypalEmail: row.paypalEmail,
            paypalEmailChangedAt: row.paypalEmailChangedAt,
            // { website, promotion, agreedToTermsAt, termsVersion }
            application: row.application,
            linkVisits: row.clickCount,
            appliedAt: row.createdAt,
            approvedAt: row.approvedAt,
            // Our decision on the application or account, and the note
            // staff wrote with it.
            reviewedAt: row.reviewedAt,
            statusNote: row.statusNote,
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
              commissionsByCurrency: payout.sourceAmounts,
              exchangeRates: payout.fxRates,
              exchangeRateDate: payout.fxDate,
              exchangeRateSource: payout.fxSource,
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

/**
 * What a payout made now would cover: every commission payable at `cutoff`
 * (past its hold by then, not voided, not paid), in every currency. The
 * admin page passes the moment it was shown, so marking it paid covers
 * exactly what the page listed, not commissions that became payable since.
 */
export async function payableCommissions(
  affiliateId: string,
  cutoff: Date,
): Promise<{
  ids: string[];
  byCurrency: Record<string, number>;
  /** Each one's stored status, to put back if the payout is undone. */
  statuses: Record<string, "pending" | "approved">;
}> {
  const rows = await db
    .select(commissionColumns)
    .from(affiliateCommission)
    .where(
      and(
        eq(affiliateCommission.affiliateId, affiliateId),
        inArray(affiliateCommission.status, ["pending", "approved"]),
        isNull(affiliateCommission.payoutId),
        lte(affiliateCommission.availableAt, cutoff),
      ),
    );
  const due = rows.filter((row) => isPayable(row, cutoff));
  return {
    ids: due.map((row) => row.id),
    byCurrency: sumByCurrency(due),
    statuses: Object.fromEntries(
      due.map((row) => [row.id, row.status as "pending" | "approved"]),
    ),
  };
}

/**
 * Before an affiliate's account is deleted: their payouts stay for the
 * books (the database sets affiliate_id and user_id to null), without the
 * PayPal address they were sent to. Nothing to do before the tables exist.
 */
export async function anonymiseAffiliatePayouts(userId: string): Promise<void> {
  try {
    await db
      .update(affiliatePayout)
      .set({ paypalEmail: null })
      .where(eq(affiliatePayout.userId, userId));
  } catch (error) {
    if (!noteMissingTables(error)) throw error;
  }
}
