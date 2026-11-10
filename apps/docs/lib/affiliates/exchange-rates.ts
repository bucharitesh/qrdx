import "server-only";

import {
  AFFILIATE_FX_DATA_URL,
  AFFILIATE_FX_SOURCE,
  AFFILIATE_FX_SOURCE_URL,
} from "./terms";

// US-dollar rates for converting commissions in other currencies at payout
// (one US$25 minimum across currencies). From the European Central Bank's
// euro reference rates: free, keyless, published once each working day
// around 16:00 CET (AFFILIATE_FX_DATA_URL). Each rate is per euro, so a
// currency's US-dollar rate is USD/EUR ÷ CURRENCY/EUR.
//
// When the ECB can't be reached, or doesn't list a currency, there is no
// rate: callers refuse to convert. Nothing is ever guessed or cached from an
// older day.

export interface UsdRates {
  /** US dollars per one unit, by lower-case currency, as decimal strings. */
  usdPer: Record<string, string>;
  /** The ECB's date for these rates (YYYY-MM-DD). */
  date: string;
  source: string;
  sourceUrl: string;
}

export type RatesResult =
  | { ok: true; rates: UsdRates }
  | { ok: false; reason: string };

/** Ten significant digits: enough for cents on any payout, and stable as text. */
const asRate = (value: number) => String(Number(value.toPrecision(10)));

/** Reads the ECB's daily XML. Null when it isn't what the ECB publishes. */
export function parseEcbDaily(xml: string): UsdRates | null {
  const date = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if (!date) return null;
  const perEuro: Record<string, number> = { eur: 1 };
  for (const match of xml.matchAll(
    /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]/g,
  )) {
    const rate = Number(match[2]);
    if (Number.isFinite(rate) && rate > 0) {
      perEuro[(match[1] as string).toLowerCase()] = rate;
    }
  }
  const usdPerEuro = perEuro.usd;
  if (!usdPerEuro) return null;
  const usdPer: Record<string, string> = {};
  for (const [currency, rate] of Object.entries(perEuro)) {
    if (currency === "usd") continue;
    usdPer[currency] = asRate(usdPerEuro / rate);
  }
  return {
    usdPer,
    date,
    source: AFFILIATE_FX_SOURCE,
    sourceUrl: AFFILIATE_FX_SOURCE_URL,
  };
}

/** Today's ECB rates, or why there are none. Never throws. */
export async function fetchUsdRates(
  fetchImpl: typeof fetch = fetch,
): Promise<RatesResult> {
  try {
    const response = await fetchImpl(AFFILIATE_FX_DATA_URL, {
      signal: AbortSignal.timeout(5000),
      // A fresh copy each time: payouts must use the payout day's rates.
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: `The ECB answered ${response.status}.`,
      };
    }
    const rates = parseEcbDaily(await response.text());
    if (!rates) {
      return { ok: false, reason: "The ECB's file had no US-dollar rate." };
    }
    return { ok: true, rates };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error && error.name === "TimeoutError"
          ? "The ECB didn't answer in time."
          : "The ECB couldn't be reached.",
    };
  }
}
