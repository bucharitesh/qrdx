import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import type { UsdRates } from "./exchange-rates";
import { currencyEntries, payableUsdTotal, toUsdCents } from "./rules";
import { AFFILIATE_PAYOUT_CURRENCY } from "./terms";

// What the admin's "Mark paid" button records, worked out when the page is
// shown: the commissions payable at that moment per currency, the exchange
// rates used for the ones not in US dollars (the ECB's, with their date),
// and the US-dollar total to send. The page hands the action a signed
// token of it, so the payout records exactly what the page showed (rates
// included) and the action can tell the token wasn't edited. The action
// still checks it against the database before recording anything.

/** How long a page's quote can be used: the rates are the payout day's. */
export const PAYOUT_QUOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PayoutQuote {
  affiliateId: string;
  /** The moment the page was shown (ISO): commissions payable then. */
  cutoff: string;
  /** Payable commissions by currency, minor units. */
  sourceAmounts: Record<string, number>;
  /** US dollars per unit for each currency other than US dollars. */
  fxRates: Record<string, string>;
  /** The ECB's date for those rates; null when everything is in US dollars. */
  fxDate: string | null;
  fxSource: string | null;
  /** What to send, in US cents. */
  usdTotal: number;
}

export interface QuoteLine {
  currency: string;
  amount: number;
  /** US dollars per unit; null for US dollars. */
  rate: string | null;
  usdCents: number;
}

export type QuoteResult =
  | { ok: true; quote: PayoutQuote; lines: QuoteLine[] }
  | { ok: false; reason: "no_rate"; currencies: string[]; detail: string };

/**
 * The quote for what's payable now. A currency other than US dollars needs
 * a rate: without one (`rates` is a failure, or doesn't list it) there's no
 * quote, so nothing is converted by a guess.
 */
export function quotePayout(input: {
  affiliateId: string;
  cutoff: Date;
  byCurrency: Readonly<Record<string, number>>;
  rates: { ok: true; rates: UsdRates } | { ok: false; reason: string } | null;
}): QuoteResult {
  const entries = currencyEntries(input.byCurrency);
  const foreign = entries
    .map(([currency]) => currency)
    .filter((currency) => currency !== AFFILIATE_PAYOUT_CURRENCY);
  const rates = input.rates?.ok ? input.rates.rates : null;
  const missing = foreign.filter((currency) => !rates?.usdPer[currency]);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "no_rate",
      currencies: missing,
      detail:
        input.rates && !input.rates.ok
          ? input.rates.reason
          : `The ECB publishes no rate for ${missing.map((c) => c.toUpperCase()).join(", ")}.`,
    };
  }
  const fxRates: Record<string, string> = {};
  for (const currency of foreign) {
    fxRates[currency] = rates?.usdPer[currency] as string;
  }
  const lines: QuoteLine[] = entries.map(([currency, amount]) => {
    const rate =
      currency === AFFILIATE_PAYOUT_CURRENCY ? null : fxRates[currency];
    return {
      currency,
      amount,
      rate: rate ?? null,
      usdCents: rate ? toUsdCents(amount, rate) : amount,
    };
  });
  const sourceAmounts = Object.fromEntries(entries);
  const usdTotal = payableUsdTotal(sourceAmounts, fxRates) ?? 0;
  return {
    ok: true,
    lines,
    quote: {
      affiliateId: input.affiliateId,
      cutoff: input.cutoff.toISOString(),
      sourceAmounts,
      fxRates,
      fxDate: foreign.length > 0 ? (rates?.date ?? null) : null,
      fxSource: foreign.length > 0 ? (rates?.source ?? null) : null,
      usdTotal,
    },
  };
}

let cachedKey: Buffer | null = null;

function signingKey(): Buffer {
  cachedKey ??= createHash("sha256")
    .update(`qrdx:affiliate-payout-quote:${env.BETTER_AUTH_SECRET}`)
    .digest();
  return cachedKey;
}

const sign = (payload: string) =>
  createHmac("sha256", signingKey()).update(payload).digest("base64url");

/** The quote as a token for the page to hand back. */
export function signPayoutQuote(quote: PayoutQuote): string {
  const payload = Buffer.from(JSON.stringify(quote)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The quote in a token this server signed, or null for anything else. */
export function readPayoutQuote(token: unknown): PayoutQuote | null {
  if (typeof token !== "string" || token.length > 4000) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  try {
    const quote = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as PayoutQuote;
    if (
      typeof quote?.affiliateId !== "string" ||
      typeof quote.cutoff !== "string" ||
      Number.isNaN(Date.parse(quote.cutoff)) ||
      !Number.isInteger(quote.usdTotal) ||
      typeof quote.sourceAmounts !== "object" ||
      typeof quote.fxRates !== "object"
    ) {
      return null;
    }
    return quote;
  } catch {
    return null;
  }
}

/** Same currencies, same amounts (zero amounts don't count). */
export function sameAmounts(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): boolean {
  const left = currencyEntries(a);
  const right = currencyEntries(b);
  return (
    left.length === right.length &&
    left.every(
      ([currency, amount], index) =>
        right[index]?.[0] === currency && right[index]?.[1] === amount,
    )
  );
}
