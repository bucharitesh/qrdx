// Display prices and Polar product ids for the pricing UI. Client-safe: no
// server imports. Feature limits live in lib/plans.ts (server).
//
// Each Polar product carries both a USD and an INR price and Polar picks the
// currency at checkout, so the amounts here are for display only.

export type Plan = "free" | "pro" | "business";
export type PaidPlan = Exclude<Plan, "free">;
export type BillingInterval = "month" | "year";
export type PricingCurrency = "USD" | "INR";

export const PAID_PLANS: readonly PaidPlan[] = ["pro", "business"];
export const BILLING_INTERVALS: readonly BillingInterval[] = ["month", "year"];
export const PRICING_CURRENCIES: readonly PricingCurrency[] = ["USD", "INR"];

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
// bundles (validated by lib/env.ts on the server).
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

/** List prices. The Free plan costs 0 in every currency. */
export const PRICING: Record<PaidPlan, Record<BillingInterval, PlanPrice>> = {
  pro: {
    month: price("pro", "month", { USD: 5, INR: 199 }),
    year: price("pro", "year", { USD: 48, INR: 1499 }),
  },
  business: {
    month: price("business", "month", { USD: 15, INR: 599 }),
    year: price("business", "year", { USD: 144, INR: 4999 }),
  },
};

/** INR for visitors from India (`x-vercel-ip-country: IN`), else USD. Display only. */
export function currencyForCountry(
  country: string | null | undefined,
): PricingCurrency {
  return country?.trim().toUpperCase() === "IN" ? "INR" : "USD";
}

/** "$5", "₹1,499" (no decimals for whole amounts). */
export function formatPrice(amount: number, currency: PricingCurrency): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
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
