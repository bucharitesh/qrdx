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
  countDistinct,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  not,
  notInArray,
  or,
  type SQL,
  sql,
  sum,
} from "drizzle-orm";
import {
  clampPage,
  loadPage,
  offsetOf,
  PAGE_SIZE,
  type Paged,
} from "@/lib/paging";
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

const emptyTotals = (): MoneyTotals => ({ pending: {}, payable: {}, paid: {} });

function addTo(target: ByCurrency, currency: string, amount: number) {
  const key = currency.toLowerCase();
  target[key] = (target[key] ?? 0) + amount;
}

/** The totals of commission rows in hand (commissionTotals sums the same in SQL). */
export function totalsOf(
  rows: readonly CommissionRow[],
  now: Date,
): MoneyTotals {
  const totals = emptyTotals();
  for (const row of rows) {
    const status = effectiveCommissionStatus(row, now);
    if (status === "void") continue;
    addTo(totals[status], row.currency, row.amount);
  }
  return totals;
}

/**
 * effectiveCommissionStatus as SQL: which commissions count as on hold,
 * payable and paid at `now`. Void ones are in none of them.
 */
function commissionBuckets(now: Date): Record<keyof MoneyTotals, SQL> {
  const payable = and(
    inArray(affiliateCommission.status, ["pending", "approved"]),
    isNull(affiliateCommission.payoutId),
    lte(affiliateCommission.availableAt, now),
  ) as SQL;
  return {
    payable,
    pending: and(
      notInArray(affiliateCommission.status, ["paid", "void"]),
      not(payable),
    ) as SQL,
    paid: eq(affiliateCommission.status, "paid"),
  };
}

const BUCKETS = ["pending", "payable", "paid"] as const;

/**
 * Pending, payable and paid totals per affiliate, summed in the database
 * (a row per affiliate and currency) instead of from every commission.
 */
async function commissionTotals(
  affiliateIds: readonly string[],
  now: Date,
): Promise<Map<string, MoneyTotals>> {
  const totals = new Map<string, MoneyTotals>();
  if (affiliateIds.length === 0) return totals;
  const buckets = commissionBuckets(now);
  const results = await Promise.all(
    BUCKETS.map((bucket) =>
      db
        .select({
          affiliateId: affiliateCommission.affiliateId,
          currency: affiliateCommission.currency,
          amount: sum(affiliateCommission.amount),
        })
        .from(affiliateCommission)
        .where(
          and(
            inArray(affiliateCommission.affiliateId, [...affiliateIds]),
            buckets[bucket],
          ),
        )
        .groupBy(affiliateCommission.affiliateId, affiliateCommission.currency),
    ),
  );
  BUCKETS.forEach((bucket, index) => {
    for (const row of results[index] ?? []) {
      const own = totals.get(row.affiliateId) ?? emptyTotals();
      addTo(own[bucket], row.currency, Number(row.amount ?? 0));
      totals.set(row.affiliateId, own);
    }
  });
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

// Newest payment first; the id keeps payments made at the same moment in
// one order, so paging never repeats or skips one.
const commissionOrder = [
  desc(affiliateCommission.orderPaidAt),
  desc(affiliateCommission.id),
];

/** Every commission (the data export has them all; the pages page them). */
async function commissionsOf(affiliateId: string): Promise<CommissionRow[]> {
  return db
    .select(commissionColumns)
    .from(affiliateCommission)
    .where(eq(affiliateCommission.affiliateId, affiliateId))
    .orderBy(...commissionOrder);
}

/** One page of an affiliate's commissions, newest payment first. */
async function commissionPage(
  affiliateId: string,
  page: number,
  now: Date,
): Promise<Paged<CommissionView>> {
  const own = eq(affiliateCommission.affiliateId, affiliateId);
  const loaded = await loadPage(page, async (target) => {
    const [rows, [counted]] = await Promise.all([
      db
        .select(commissionColumns)
        .from(affiliateCommission)
        .where(own)
        .orderBy(...commissionOrder)
        .limit(PAGE_SIZE)
        .offset(offsetOf(target)),
      db.select({ total: count() }).from(affiliateCommission).where(own),
    ]);
    return { rows, total: Number(counted?.total ?? 0) };
  });
  return {
    ...loaded,
    rows: loaded.rows.map((commission) => ({
      ...commission,
      status: effectiveCommissionStatus(commission, now),
    })),
  };
}

export type PayoutRow = typeof affiliatePayout.$inferSelect;

/** About one a month, so not paged. */
async function payoutsOf(affiliateId: string): Promise<PayoutRow[]> {
  return db
    .select()
    .from(affiliatePayout)
    .where(eq(affiliatePayout.affiliateId, affiliateId))
    .orderBy(desc(affiliatePayout.paidAt), desc(affiliatePayout.id));
}

interface ReferralCounts {
  signUps: number;
  payingCustomers: number;
}

/** Sign-ups and paying customers per affiliate, counted in one query. */
async function referralCounts(
  affiliateIds: readonly string[],
): Promise<Map<string, ReferralCounts>> {
  if (affiliateIds.length === 0) return new Map();
  const rows = await db
    .select({
      affiliateId: affiliateReferral.affiliateId,
      signUps: count(),
      payingCustomers: count(affiliateReferral.firstPaidAt),
    })
    .from(affiliateReferral)
    .where(inArray(affiliateReferral.affiliateId, [...affiliateIds]))
    .groupBy(affiliateReferral.affiliateId);
  return new Map(
    rows.map((row) => [
      row.affiliateId,
      {
        signUps: Number(row.signUps),
        payingCustomers: Number(row.payingCustomers),
      },
    ]),
  );
}

/** Referral counts and money totals for some affiliates, read in parallel. */
async function affiliateFigures(affiliateIds: readonly string[], now: Date) {
  const [counts, totals] = await Promise.all([
    referralCounts(affiliateIds),
    commissionTotals(affiliateIds, now),
  ]);
  return (id: string): ReferralCounts & { totals: MoneyTotals } => ({
    signUps: counts.get(id)?.signUps ?? 0,
    payingCustomers: counts.get(id)?.payingCustomers ?? 0,
    totals: totals.get(id) ?? emptyTotals(),
  });
}

// ─── The affiliate's dashboard ──────────────────────────────────────────────

export interface AffiliateDashboard {
  affiliate: AffiliateRow | null;
  clicks: number;
  signUps: number;
  payingCustomers: number;
  /** Over every commission, not only the page shown. */
  totals: MoneyTotals;
  commissions: Paged<CommissionView>;
  payouts: PayoutRow[];
}

/** Settings → Affiliate program. `affiliate` is null for someone who hasn't applied. */
export async function loadAffiliateDashboard(
  userId: string,
  now = new Date(),
  { page = 1 }: { page?: number } = {},
): Promise<Loaded<AffiliateDashboard>> {
  return whenReady(async () => {
    const row = await getAffiliateForUser(userId);
    const empty: AffiliateDashboard = {
      affiliate: row,
      clicks: row?.clickCount ?? 0,
      signUps: 0,
      payingCustomers: 0,
      totals: emptyTotals(),
      commissions: { rows: [], total: 0, page: 1 },
      payouts: [],
    };
    if (!row || row.status === "pending" || row.status === "rejected") {
      return empty;
    }
    const [figures, commissions, payouts] = await Promise.all([
      affiliateFigures([row.id], now),
      commissionPage(row.id, page, now),
      payoutsOf(row.id),
    ]);
    return { ...empty, ...figures(row.id), commissions, payouts };
  });
}

// ─── Admin ──────────────────────────────────────────────────────────────────

/** An affiliate as the admin lists show them. */
export interface AdminAffiliateSummary {
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
}

/** With their referrals and what they're owed. */
export interface AdminAffiliateRow extends AdminAffiliateSummary {
  signUps: number;
  payingCustomers: number;
  totals: MoneyTotals;
}

const adminAffiliateColumns = {
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
};

/** Approved and suspended: the affiliates table, with its money columns. */
const ACTIVE_STATUSES: AffiliateStatus[] = ["approved", "suspended"];

export interface AdminAffiliateList {
  stats: {
    /** Applications waiting (pending). */
    applications: number;
    approved: number;
    /** Approved or suspended, with something past its hold and unpaid. */
    withPayableBalance: number;
    /** Sign-ups referred by every affiliate listed. */
    signUps: number;
  };
  applications: Paged<AdminAffiliateSummary>;
  /** Approved and suspended, with their figures. */
  affiliates: Paged<AdminAffiliateRow>;
  rejected: Paged<AdminAffiliateSummary>;
}

/**
 * /admin/affiliates: applications, affiliates and rejected applications,
 * each newest first and paged on its own. The counts and money come from
 * SQL aggregates, for the affiliates on the page only.
 */
export async function listAffiliatesForAdmin(
  now = new Date(),
  pages: { applications?: number; affiliates?: number; rejected?: number } = {},
): Promise<Loaded<AdminAffiliateList>> {
  return whenReady(async () => {
    const [byStatus, [payable], [referred]] = await Promise.all([
      db
        .select({ status: affiliate.status, total: count() })
        .from(affiliate)
        .innerJoin(user, eq(user.id, affiliate.userId))
        .groupBy(affiliate.status),
      db
        .select({ total: countDistinct(affiliateCommission.affiliateId) })
        .from(affiliateCommission)
        .innerJoin(affiliate, eq(affiliate.id, affiliateCommission.affiliateId))
        .innerJoin(user, eq(user.id, affiliate.userId))
        .where(
          and(
            inArray(affiliate.status, ACTIVE_STATUSES),
            commissionBuckets(now).payable,
          ),
        ),
      db
        .select({ total: count() })
        .from(affiliateReferral)
        .innerJoin(affiliate, eq(affiliate.id, affiliateReferral.affiliateId))
        .innerJoin(user, eq(user.id, affiliate.userId)),
    ]);
    const statusTotal = (statuses: readonly string[]) =>
      byStatus
        .filter((row) => statuses.includes(row.status))
        .reduce((total, row) => total + Number(row.total), 0);

    // The same FROM, join and status filter as the counts above, so a page
    // past the end is clamped to the last one that has rows.
    const section = async (
      statuses: AffiliateStatus[],
      requested = 1,
    ): Promise<Paged<AdminAffiliateSummary>> => {
      const total = statusTotal(statuses);
      const page = clampPage(requested, total);
      if (total === 0) return { rows: [], total, page };
      const rows = await db
        .select(adminAffiliateColumns)
        .from(affiliate)
        .innerJoin(user, eq(user.id, affiliate.userId))
        .where(inArray(affiliate.status, statuses))
        .orderBy(desc(affiliate.createdAt), desc(affiliate.id))
        .limit(PAGE_SIZE)
        .offset(offsetOf(page));
      return {
        rows: rows.map((row) => ({
          ...row,
          status: row.status as AffiliateStatus,
        })),
        total,
        page,
      };
    };

    const [applications, active, rejected] = await Promise.all([
      section(["pending"], pages.applications),
      section(ACTIVE_STATUSES, pages.affiliates),
      section(["rejected"], pages.rejected),
    ]);
    const figuresOf = await affiliateFigures(
      active.rows.map((row) => row.id),
      now,
    );
    return {
      stats: {
        applications: applications.total,
        approved: statusTotal(["approved"]),
        withPayableBalance: Number(payable?.total ?? 0),
        signUps: Number(referred?.total ?? 0),
      },
      applications,
      affiliates: {
        ...active,
        rows: active.rows.map((row) => ({ ...row, ...figuresOf(row.id) })),
      },
      rejected,
    };
  });
}

export interface AdminAffiliateDetail {
  affiliate: AdminAffiliateRow;
  /** One page; the totals on `affiliate` cover every commission. */
  commissions: Paged<CommissionView>;
  payouts: PayoutRow[];
}

export async function loadAffiliateForAdmin(
  affiliateId: string,
  now = new Date(),
  { page = 1 }: { page?: number } = {},
): Promise<Loaded<AdminAffiliateDetail | null>> {
  return whenReady(async () => {
    const [row] = await db
      .select(adminAffiliateColumns)
      .from(affiliate)
      .innerJoin(user, eq(user.id, affiliate.userId))
      .where(eq(affiliate.id, affiliateId))
      .limit(1);
    if (!row) return null;
    const [figures, commissions, payouts] = await Promise.all([
      affiliateFigures([row.id], now),
      commissionPage(row.id, page, now),
      payoutsOf(row.id),
    ]);
    return {
      affiliate: {
        ...row,
        status: row.status as AffiliateStatus,
        ...figures(row.id),
      },
      commissions,
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
