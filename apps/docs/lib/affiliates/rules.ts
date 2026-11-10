// The affiliate program's rules as pure functions: no database, no request.
// The server code (./server.ts) and the tests use these, so the maths is
// tested once and can't drift between the webhook, the cron and the pages.
import { RESERVED_SLUGS } from "@/lib/short-links";
import {
  AFFILIATE_COMMISSION_BPS,
  AFFILIATE_COMMISSION_MONTHS,
  AFFILIATE_HOLD_DAYS,
  AFFILIATE_MIN_PAYOUT_USD,
  AFFILIATE_RANDOM_CODE_LENGTH,
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

/**
 * How a referral reached the account. Only "link": the code came with the
 * sign-up itself, in the same visit (there's no cookie).
 */
export type AttributionVia = "link";

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
 * What the customer was actually charged for QRdx, before tax, in minor
 * units. Polar's `net_amount` is the order's price after discounts and
 * before tax, but account credit (a positive customer balance, say from a
 * downgrade) lowers what's charged. Polar's order schema says so:
 * `applied_balance_amount` is the customer's balance applied to the order,
 * which "can decrease" the amount paid, and `due_amount` is the amount due
 * for it, tax included. So the base is `net_amount`, capped at
 * `due_amount − tax_amount`. A payload without `due_amount` isn't capped.
 * Never below zero.
 */
export function chargedNetAmount(order: {
  net_amount: number;
  tax_amount?: number | null;
  due_amount?: number | null;
}): number {
  const net = Math.max(0, Number(order.net_amount) || 0);
  const due = Number(order.due_amount);
  if (!Number.isFinite(due)) return net;
  const tax = Math.max(0, Number(order.tax_amount ?? 0) || 0);
  return Math.max(0, Math.min(net, due - tax));
}

/**
 * The amount a commission is based on: what the customer was charged before
 * tax (chargedNetAmount) less `refunded_amount` (what has been refunded of
 * it, also before tax). Never below zero.
 */
export function commissionBase(order: {
  net_amount: number;
  tax_amount?: number | null;
  due_amount?: number | null;
  refunded_amount?: number | null;
}): number {
  const refunded = Math.max(0, Number(order.refunded_amount ?? 0) || 0);
  return Math.max(0, chargedNetAmount(order) - refunded);
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

/**
 * The end of a customer's 12 months: one day before the anniversary of
 * their first payment. A yearly renewal, or the 13th monthly payment, is
 * charged on the anniversary, and the webhook can arrive a little before or
 * after it; ending a day early keeps that renewal out whatever the timing.
 */
export function commissionWindowEnd(firstPaidAt: Date): Date {
  return new Date(
    addMonthsUtc(firstPaidAt, AFFILIATE_COMMISSION_MONTHS).getTime() - DAY_MS,
  );
}

/**
 * A payment earns when it's within the customer's first 12 months: from
 * their first payment (included) to a day before its anniversary.
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

/**
 * One minimum for everything payable together, in US cents: US-dollar
 * commissions plus the others converted at the payout date.
 */
export function meetsMinimumPayout(usdCents: number): boolean {
  return Number.isFinite(usdCents) && usdCents >= AFFILIATE_MIN_PAYOUT_USD;
}

/**
 * An amount in `currency` minor units, in US cents at `usdPerUnit` (US
 * dollars per one unit of the currency, a decimal string such as
 * "0.0113636"), rounded down. Two-decimal currencies only: US$ and ₹ both
 * have 100 minor units.
 */
export function toUsdCents(minor: number, usdPerUnit: string): number {
  const rate = Number(usdPerUnit);
  if (!(Number.isFinite(rate) && rate > 0)) {
    throw new Error("Not an exchange rate");
  }
  return Math.floor(minor * rate + 1e-9);
}

/**
 * What everything payable comes to in US cents: US dollars as they are, the
 * other currencies at `usdPer` (US dollars per unit, by currency). Null when
 * a currency has no rate, so nothing is ever guessed.
 */
export function payableUsdTotal(
  byCurrency: Readonly<Record<string, number>>,
  usdPer: Readonly<Record<string, string>>,
): number | null {
  let total = 0;
  for (const [currency, amount] of Object.entries(byCurrency)) {
    if (amount === 0) continue;
    if (currency === "usd") {
      total += amount;
      continue;
    }
    const rate = usdPer[currency];
    if (!rate) return null;
    total += toUsdCents(amount, rate);
  }
  return total;
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

/**
 * The letters and digits of a random code ("k7q2mx9p"): none that can be
 * mistaken for each other (no i, l, o, 0 or 1).
 */
export const REFERRAL_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** A new random code: never made from a name or an email address. */
export function randomReferralCode(
  random: (length: number) => Uint8Array = (length) =>
    crypto.getRandomValues(new Uint8Array(length)),
): string {
  return Array.from(
    random(AFFILIATE_RANDOM_CODE_LENGTH),
    (byte) => REFERRAL_CODE_ALPHABET[byte % REFERRAL_CODE_ALPHABET.length],
  ).join("");
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
 * Words a chosen code can't be: QRdx's own paths and names (the short-link
 * reserved list, lib/short-links.ts) and words that would pass for QRdx or
 * its staff.
 */
export const RESERVED_REFERRAL_CODES: ReadonlySet<string> = new Set([
  ...RESERVED_SLUGS,
  "affiliate",
  "affiliates",
  "partner",
  "partners",
  "referral",
  "referrals",
  "ref",
  "official",
  "staff",
  "team-qrdx",
  "qrdx-team",
  "qrdx-official",
  "qrdxdev",
  "qrdx-dev",
  "paypal",
  "polar",
  "payout",
  "payouts",
]);

export type ChosenCodeProblem = "format" | "reserved" | "email";

/**
 * An email address's local part as a code would spell it ("ana.diaz+x" →
 * "ana-diaz-x"), to keep people from publishing their address in a link.
 */
export function emailLocalPartAsCode(email: string): string {
  return asCodeSpelling(email.split("@")[0] ?? "");
}

const asCodeSpelling = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Checks a code an affiliate wants: the format, reserved words, and not the
 * local part of their own email address (in any spelling: "ana.diaz",
 * "anadiaz" or "ana-diaz" for ana.diaz@…, with or without a +tag). Whether
 * it's free is the database's question. Returns the code as stored.
 */
export function checkChosenCode(
  value: unknown,
  ownEmails: readonly string[] = [],
): { ok: true; code: string } | { ok: false; problem: ChosenCodeProblem } {
  const code = parseReferralCode(value);
  if (!code) return { ok: false, problem: "format" };
  if (RESERVED_REFERRAL_CODES.has(code) || /^qrdx-?/.test(code)) {
    return { ok: false, problem: "reserved" };
  }
  const bare = code.replace(/-/g, "");
  for (const email of ownEmails) {
    const local = email.split("@")[0] ?? "";
    // The whole local part, and the part before a +tag.
    for (const part of [local, local.split("+")[0] ?? ""]) {
      const spelling = asCodeSpelling(part).replace(/-/g, "");
      if (spelling && bare === spelling) {
        return { ok: false, problem: "email" };
      }
    }
  }
  return { ok: true, code };
}

/** What each problem with a chosen code means, for the form. */
export const CHOSEN_CODE_MESSAGES: Record<
  ChosenCodeProblem | "taken" | "already_changed",
  string
> = {
  format:
    "Use 3 to 32 lower-case letters, digits and single hyphens, starting and ending with a letter or digit.",
  reserved: "That code is reserved. Pick another.",
  email:
    "That's the start of your email address. Pick a code that doesn't publish it.",
  taken: "That code is taken. Pick another.",
  already_changed: "You've already chosen your code. It can only change once.",
};

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
