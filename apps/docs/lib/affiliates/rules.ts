// The affiliate program's rules as pure functions: no database, no request.
// The server code (./server.ts) and the tests use these, so the maths is
// tested once and can't drift between the webhook, the cron and the pages.
import {
  AFFILIATE_COMMISSION_BPS,
  AFFILIATE_COMMISSION_MONTHS,
  AFFILIATE_HOLD_DAYS,
  AFFILIATE_MIN_PAYOUT,
} from "./terms";

export const AFFILIATE_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "suspended",
] as const;
export type AffiliateStatus = (typeof AFFILIATE_STATUSES)[number];

/**
 * A commission's stored status. "approved" is written by the daily cron once
 * the hold is over; until then a pending one past its hold is payable all the
 * same (effectiveCommissionStatus), so nothing waits on the cron.
 */
export const COMMISSION_STATUSES = [
  "pending",
  "approved",
  "void",
  "paid",
] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

/** What a person sees: on hold, payable, paid or cancelled. */
export type EffectiveCommissionStatus = "pending" | "payable" | "paid" | "void";

export const VOID_REASONS = [
  "refund",
  "chargeback",
  "self_referral",
  "admin",
] as const;
export type VoidReason = (typeof VOID_REASONS)[number];

/** How a referral reached the account: carried through sign-up, or the cookie. */
export type AttributionVia = "link" | "cookie";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The commission on an amount in minor units: 30%, rounded down to a whole
 * minor unit (never in the affiliate's favour by a fraction of a cent).
 */
export function commissionFor(baseMinor: number): number {
  if (!Number.isFinite(baseMinor) || baseMinor <= 0) return 0;
  return Math.floor((baseMinor * AFFILIATE_COMMISSION_BPS) / 10_000);
}

/**
 * The amount a commission is based on: Polar's `net_amount` (after
 * discounts, before tax) less `refunded_amount` (what has been refunded of
 * it, also before tax). Never below zero.
 */
export function commissionBase(order: {
  net_amount: number;
  refunded_amount?: number | null;
}): number {
  const net = Number(order.net_amount) || 0;
  const refunded = Number(order.refunded_amount ?? 0) || 0;
  return Math.max(0, net - refunded);
}

/** The date a commission can be paid: the payment plus the 30-day hold. */
export function availableAtFor(paidAt: Date): Date {
  return new Date(paidAt.getTime() + AFFILIATE_HOLD_DAYS * DAY_MS);
}

/** `date` plus `months` calendar months, in UTC (31 Jan + 1 month → 28/29 Feb). */
export function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** The end of a customer's 12 months, from their first payment. */
export function commissionWindowEnd(firstPaidAt: Date): Date {
  return addMonthsUtc(firstPaidAt, AFFILIATE_COMMISSION_MONTHS);
}

/**
 * A payment earns when it's within 12 months of the customer's first
 * payment (the first one itself included; exactly 12 months later doesn't).
 */
export function isWithinCommissionWindow(
  firstPaidAt: Date,
  paidAt: Date,
): boolean {
  return (
    paidAt.getTime() >= firstPaidAt.getTime() &&
    paidAt.getTime() < commissionWindowEnd(firstPaidAt).getTime()
  );
}

/** Pending or approved, and the hold is over: it can be paid. */
export function isPayable(
  row: { status: string; availableAt: Date; payoutId?: string | null },
  now: Date,
): boolean {
  return (
    (row.status === "pending" || row.status === "approved") &&
    !row.payoutId &&
    row.availableAt.getTime() <= now.getTime()
  );
}

export function effectiveCommissionStatus(
  row: { status: string; availableAt: Date; payoutId?: string | null },
  now: Date,
): EffectiveCommissionStatus {
  if (row.status === "paid") return "paid";
  if (row.status === "void") return "void";
  return isPayable(row, now) ? "payable" : "pending";
}

/**
 * A refund cancels a commission when it happened before the hold ended and
 * the commission hasn't been paid or cancelled already. Later refunds leave
 * it as it is: that's what the 30 days are for.
 */
export function refundVoids(
  row: { status: string; availableAt: Date },
  refundedAt: Date,
): boolean {
  return (
    (row.status === "pending" || row.status === "approved") &&
    refundedAt.getTime() < row.availableAt.getTime()
  );
}

/** The smallest payout in `currency` (minor units), or null when none is set. */
export function minimumPayout(currency: string): number | null {
  return AFFILIATE_MIN_PAYOUT[currency.trim().toLowerCase()] ?? null;
}

export function meetsMinimumPayout(amount: number, currency: string): boolean {
  const minimum = minimumPayout(currency);
  return minimum !== null && amount >= minimum;
}

/**
 * An address in the form two accounts of one person would share: lower case,
 * no "+tag", and for Gmail no dots (Gmail ignores both). Used for the
 * self-referral check only, never stored.
 */
export function canonicalEmail(email: string | null | undefined): string {
  const value = (email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return value;
  let local = value.slice(0, at);
  let domain = value.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

export function isSameCanonicalEmail(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = canonicalEmail(a);
  return left.includes("@") && left === canonicalEmail(b);
}

/** Referral codes: 3 to 32 lower-case letters, digits and single hyphens. */
export const REFERRAL_CODE_PATTERN =
  /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,31}$/;

/** A code as typed or carried in a link, or null when it can't be one. */
export function parseReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

/**
 * A readable code from a name: "Ana Díaz" → "ana-diaz", cut to fit a random
 * suffix ("ana-diaz-4k2p"), or "partner" when the name has no letters.
 */
export function referralCodeStem(name: string | null | undefined): string {
  const stem = (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20)
    .replace(/-+$/g, "");
  return stem.length >= 2 ? stem : "partner";
}

/**
 * Per-currency amounts in a steady order for display: US dollars first,
 * then the others alphabetically. Zero amounts are left out.
 */
export function currencyEntries(
  totals: Readonly<Record<string, number>>,
): [string, number][] {
  return Object.entries(totals)
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) =>
      a === "usd" ? -1 : b === "usd" ? 1 : a.localeCompare(b),
    );
}

/** Adds up amounts per currency: { usd: 1500, inr: 5970 }. */
export function sumByCurrency(
  rows: readonly { currency: string; amount: number }[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const currency = row.currency.toLowerCase();
    totals[currency] = (totals[currency] ?? 0) + row.amount;
  }
  return totals;
}
