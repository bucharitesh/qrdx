// The affiliate program's numbers, in one light module (no React, no
// "server-only"). Everything reads them from here: the commission code
// (lib/affiliates/rules.ts and server.ts), the /affiliates page, the
// dashboard, the admin area, and the legal and help pages through the
// `{facts.affiliate…}` tokens (lib/product-facts.ts). Change a number here
// and every page and every calculation follows.
//
// The owner's decisions (10 Nov 2026): 30% of what a referred customer pays,
// for their first 12 months as a paying customer; each commission waits 30
// days, and a refund or chargeback in that time cancels it; paid monthly by
// PayPal, by hand, from US$25. The rupee minimum is the one figure that
// wasn't in those decisions: see AFFILIATE_MIN_PAYOUT.

/** The commission, in basis points of the amount the customer paid (30%). */
export const AFFILIATE_COMMISSION_BPS = 3000;

/** The same, as copy writes it: "30". */
export const AFFILIATE_COMMISSION_PERCENT = AFFILIATE_COMMISSION_BPS / 100;

/** Months from a customer's first payment during which their payments earn. */
export const AFFILIATE_COMMISSION_MONTHS = 12;

/** Days each commission waits before it can be paid. */
export const AFFILIATE_HOLD_DAYS = 30;

/**
 * The smallest payout, in minor units, by the currency Polar reports the
 * order in (lower case, as Polar sends it). Balances are kept per currency
 * and never converted: Polar's webhooks don't say what an order was worth
 * in US dollars, so there's no exchange rate the app could use honestly.
 * US$25 is the owner's figure. ₹2,200 is about the same at late-2026 rates
 * and needs the owner's sign-off (see the PR). A currency without an entry
 * here can't be marked paid until one is added.
 */
export const AFFILIATE_MIN_PAYOUT: Readonly<Record<string, number>> = {
  usd: 2500,
  inr: 220000,
};

/** How payouts are sent. Always by hand: the app only records them. */
export const AFFILIATE_PAYOUT_METHOD = "PayPal";

/**
 * The browser cookie that remembers a referral link for a visitor who signs
 * up later. Set only after the visitor allows Analytics in Cookie settings
 * (components/consent/referral-capture.tsx); listed in the Cookie Policy.
 */
export const AFFILIATE_REFERRAL_COOKIE = "qrdx_ref";

/** How long that cookie lasts. */
export const AFFILIATE_REFERRAL_COOKIE_DAYS = 30;

/** The query parameter that carries a referral code: /?ref=<code>. */
export const AFFILIATE_REF_PARAM = "ref";

/** Referral links are <app url>/r/<code>. */
export const AFFILIATE_LINK_PREFIX = "/r/";

/** "US$25", "₹2,200": a minimum as copy writes it. */
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

/** The minimum in US dollars, as copy writes it: "US$25". */
export const AFFILIATE_MIN_PAYOUT_USD_LABEL = formatMinorAmount(
  AFFILIATE_MIN_PAYOUT.usd ?? 0,
  "usd",
);

/** The minimum in rupees, as copy writes it: "₹2,200". */
export const AFFILIATE_MIN_PAYOUT_INR_LABEL = formatMinorAmount(
  AFFILIATE_MIN_PAYOUT.inr ?? 0,
  "inr",
);
