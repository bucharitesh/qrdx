// The affiliate program's numbers, in one light module (no React, no
// "server-only"). Everything reads them from here: the commission code
// (lib/affiliates/rules.ts and server.ts), the /affiliates page, the
// dashboard, the admin area, and the legal and help pages through the
// `{facts.affiliate…}` tokens (lib/product-facts.ts). Change a number here
// and every page and every calculation follows.
//
// The owner's decisions (10 Nov 2026): 30% of what a referred customer pays,
// for their first 12 months as a paying customer; each commission waits 30
// days (45 since 13 Nov 2026, so a refund under the 30-day money-back
// guarantee asked for on its last day still lands inside the hold), and a
// refund or chargeback in that time cancels it; paid monthly by
// PayPal, by hand, from US$25, with commissions in other currencies
// converted to US dollars at the payout date; referrals count only for a
// sign-up in the same visit (no cookie); random referral codes that can be
// changed once; 30 days' notice before the terms change.

/** The commission, in basis points of the amount the customer paid (30%). */
export const AFFILIATE_COMMISSION_BPS = 3000;

/** The same, as copy writes it: "30". */
export const AFFILIATE_COMMISSION_PERCENT = AFFILIATE_COMMISSION_BPS / 100;

/** Months from a customer's first payment during which their payments earn. */
export const AFFILIATE_COMMISSION_MONTHS = 12;

/**
 * Days each commission waits before it can be paid. Longer than the
 * money-back guarantee (MONEY_BACK_DAYS), because a refund asked for within
 * the guarantee can be made after it ends, and a refund after the hold no
 * longer cancels the commission.
 */
export const AFFILIATE_HOLD_DAYS = 45;

/** Payouts are sent in this currency, lower case as Polar writes currencies. */
export const AFFILIATE_PAYOUT_CURRENCY = "usd";

/**
 * The smallest payout, in US cents, for everything payable together:
 * commissions in other currencies count at their US-dollar value on the
 * payout date (lib/affiliates/exchange-rates.ts).
 */
export const AFFILIATE_MIN_PAYOUT_USD = 2500;

/**
 * Where those exchange rates come from: the European Central Bank's euro
 * foreign exchange reference rates, published once each working day,
 * free and without a key. A currency's US-dollar rate is the ECB's USD rate
 * divided by its rate for that currency (both are per euro).
 */
export const AFFILIATE_FX_SOURCE = "European Central Bank reference rates";
export const AFFILIATE_FX_SOURCE_URL =
  "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
/** The data itself: today's rates as XML. */
export const AFFILIATE_FX_DATA_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/** Days of notice before changed terms apply. */
export const AFFILIATE_TERMS_NOTICE_DAYS = 30;

/**
 * The version of the affiliate terms an application accepts: the date in
 * content/legal/affiliate-terms.mdx's `lastUpdated` (a test keeps the two
 * the same). Stored with each acceptance, so it's clear which text someone
 * agreed to. Change both when the terms change.
 */
export const AFFILIATE_TERMS_VERSION = "2026-11-13";

/** New referral codes are this many random letters and digits. */
export const AFFILIATE_RANDOM_CODE_LENGTH = 8;

/**
 * A referral code as the program makes them (random, AFFILIATE_RANDOM_CODE_
 * LENGTH characters from the referral alphabet). For example copy only.
 */
export const EXAMPLE_REFERRAL_CODE = "k7q2mx9p";

/** How payouts are sent. Always by hand: the app only records them. */
export const AFFILIATE_PAYOUT_METHOD = "PayPal";

/** The query parameter that carries a referral code: /?ref=<code>. */
export const AFFILIATE_REF_PARAM = "ref";

/** Referral links are <app url>/r/<code>. */
export const AFFILIATE_LINK_PREFIX = "/r/";

/** "US$25", "₹2,200": an amount in minor units as copy writes it. */
export function formatMinorAmount(minor: number, currency: string): string {
  const code = currency.toUpperCase();
  const whole = minor / 100;
  try {
    return new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: code,
      // "US$25" rather than "$25", so it can't be read as another dollar.
      currencyDisplay: code === "USD" ? "symbol" : "narrowSymbol",
      minimumFractionDigits: Number.isInteger(whole) ? 0 : 2,
      maximumFractionDigits: 2,
    })
      .format(whole)
      .replace(/^\$/, "US$");
  } catch {
    return `${whole.toFixed(2)} ${code}`;
  }
}

/** The minimum as copy writes it: "US$25". */
export const AFFILIATE_MIN_PAYOUT_LABEL = formatMinorAmount(
  AFFILIATE_MIN_PAYOUT_USD,
  AFFILIATE_PAYOUT_CURRENCY,
);
