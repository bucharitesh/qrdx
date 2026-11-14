// Display prices and Polar product ids for the pricing UI. Client-safe: no
// server imports. Feature limits live in lib/plans.ts (server).
//
// Each Polar product carries a USD and an INR price, and a EUR price once
// NEXT_PUBLIC_QRDX_EUR_PRICES is on (set it only after adding the EUR prices
// in Polar). Checkout asks Polar for the currency of the visitor's country
// (lib/region.ts checkoutCurrency), so the amounts here match what's charged.

// The availability rules read NEXT_PUBLIC_QRDX_EUR_PRICES the same way.
import { isFlagOn } from "@repo/availability/flags";

export type Plan = "free" | "pro" | "business";
export type PaidPlan = Exclude<Plan, "free">;
export type BillingInterval = "month" | "year";
export type PricingCurrency = "USD" | "INR" | "EUR";

export const PAID_PLANS: readonly PaidPlan[] = ["pro", "business"];
export const BILLING_INTERVALS: readonly BillingInterval[] = ["month", "year"];

/**
 * Euro prices, for visitors in the EU and EEA: on only once every Polar
 * product has its EUR price, so the site never shows a price checkout
 * won't charge. A literal read so Next inlines it into client bundles.
 */
export const EUR_PRICES = isFlagOn(process.env.NEXT_PUBLIC_QRDX_EUR_PRICES);

/** The currencies prices are shown and charged in on this deployment. */
export function pricingCurrencies(
  eur: boolean = EUR_PRICES,
): readonly PricingCurrency[] {
  return eur ? ["USD", "INR", "EUR"] : ["USD", "INR"];
}

export const PRICING_CURRENCIES: readonly PricingCurrency[] =
  pricingCurrencies();

/** Days after the first payment for a paid plan to ask for a full refund (content/legal/refunds.mdx). */
export const MONEY_BACK_DAYS = 30;

/** Discount on Pro and Business for registered non-profits and charities, in percent. */
export const NONPROFIT_DISCOUNT_PERCENT = 50;

/** Display names, e.g. for plan badges. */
export const PLAN_NAMES: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

/** Env var holding a Polar product id, e.g. NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID */
export type ProductIdEnv =
  `NEXT_PUBLIC_QRDX_${Uppercase<PaidPlan>}_${"MONTHLY" | "YEARLY"}_PRODUCT_ID`;

export interface PlanPrice {
  plan: PaidPlan;
  interval: BillingInterval;
  /** Whole units per `interval`, by display currency */
  amounts: Record<PricingCurrency, number>;
  productIdEnv: ProductIdEnv;
  /** That env var's value, inlined at build time (null when unset) */
  productId: string | null;
}

const id = (value: string | undefined) => value || null;

// Literal `process.env.NEXT_PUBLIC_*` reads so Next inlines them into client
// bundles (validated by env.ts on the server).
const PRODUCT_IDS: Record<ProductIdEnv, string | null> = {
  NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID: id(
    process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID,
  ),
  NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID: id(
    process.env.NEXT_PUBLIC_QRDX_PRO_YEARLY_PRODUCT_ID,
  ),
  NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID: id(
    process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID,
  ),
  NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID: id(
    process.env.NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID,
  ),
};

function price(
  plan: PaidPlan,
  interval: BillingInterval,
  amounts: Record<PricingCurrency, number>,
): PlanPrice {
  const tier = plan.toUpperCase() as Uppercase<PaidPlan>;
  const period = interval === "month" ? "MONTHLY" : "YEARLY";
  const productIdEnv = `NEXT_PUBLIC_QRDX_${tier}_${period}_PRODUCT_ID` as const;
  return {
    plan,
    interval,
    amounts,
    productIdEnv,
    productId: PRODUCT_IDS[productIdEnv],
  };
}

/**
 * List prices. The Free plan costs 0 in every currency. Euro prices mirror
 * the dollar ones; Polar adds VAT on top in both.
 */
export const PRICING: Record<PaidPlan, Record<BillingInterval, PlanPrice>> = {
  pro: {
    month: price("pro", "month", { USD: 5, INR: 199, EUR: 5 }),
    year: price("pro", "year", { USD: 48, INR: 1499, EUR: 48 }),
  },
  business: {
    month: price("business", "month", { USD: 15, INR: 599, EUR: 15 }),
    year: price("business", "year", { USD: 144, INR: 4999, EUR: 144 }),
  },
};

/**
 * The EU's 27 member states, their outermost regions that have country
 * codes of their own, and the EEA's Iceland, Liechtenstein and Norway:
 * where prices show (and checkout charges) in euros once EUR_PRICES is on.
 */
export const EUR_COUNTRIES: ReadonlySet<string> = new Set([
  // EU member states
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  // EU regions with their own country codes (Åland, French overseas regions)
  "AX",
  "GF",
  "GP",
  "MF",
  "MQ",
  "RE",
  "YT",
  // EEA
  "IS",
  "LI",
  "NO",
]);

/**
 * INR for visitors from India, EUR for the EU and EEA when euro prices are
 * on, else USD (`x-vercel-ip-country`).
 */
export function currencyForCountry(
  country: string | null | undefined,
  eur: boolean = EUR_PRICES,
): PricingCurrency {
  const code = country?.trim().toUpperCase() ?? "";
  if (code === "IN") return "INR";
  if (eur && EUR_COUNTRIES.has(code)) return "EUR";
  return "USD";
}

/**
 * "$5", "₹1,499", "€48" (no decimals for whole amounts). Translated pages
 * pass their locale: the language picks the format, never the currency
 * (lib/region does), so Spanish shows "5 US$" (a bare "$" reads as pesos)
 * and rupees always show "₹".
 */
export function formatPrice(
  amount: number,
  currency: PricingCurrency,
  locale?: string,
): string {
  const english = !locale || locale === "en";
  return new Intl.NumberFormat(
    english ? (currency === "INR" ? "en-IN" : "en-US") : locale,
    {
      style: "currency",
      currency,
      currencyDisplay: currency === "INR" ? "narrowSymbol" : "symbol",
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    },
  ).format(amount);
}

/**
 * "in India ₹199 or ₹1,499; in the EU and EEA €5 or €48": a plan's other
 * currencies, in English, for the Markdown copies agents read.
 */
export function localPricesNote(
  plan: PaidPlan,
  eur: boolean = EUR_PRICES,
): string {
  const pair = (currency: PricingCurrency) =>
    `${formatPrice(PRICING[plan].month.amounts[currency], currency)} or ${formatPrice(PRICING[plan].year.amounts[currency], currency)}`;
  return [
    `in India ${pair("INR")}`,
    ...(eur ? [`in the EU and EEA ${pair("EUR")}`] : []),
  ].join("; ");
}

/** Paid plan a Polar product id belongs to, or null for other products. */
export function planForProductId(
  productId: string | null | undefined,
): PaidPlan | null {
  if (!productId) return null;
  for (const plan of PAID_PLANS) {
    for (const interval of BILLING_INTERVALS) {
      if (PRICING[plan][interval].productId === productId) return plan;
    }
  }
  return null;
}
