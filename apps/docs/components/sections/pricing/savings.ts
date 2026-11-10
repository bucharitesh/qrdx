// Yearly savings for the billing toggle. Client-safe and copy-free, so the
// pricing cards don't pull the message catalog in (plan-content.ts does).
import { type PaidPlan, PRICING, type PricingCurrency } from "@/lib/pricing";

/** Whole-percent saving of the yearly price over 12 monthly payments. */
export function yearlySavingsPercent(
  plan: PaidPlan,
  currency: PricingCurrency,
): number {
  const monthly = PRICING[plan].month.amounts[currency];
  const yearly = PRICING[plan].year.amounts[currency];
  return Math.round((1 - yearly / (monthly * 12)) * 100);
}

/** Largest yearly saving across paid plans, for the billing toggle. */
export function maxYearlySavingsPercent(currency: PricingCurrency): number {
  return Math.max(
    yearlySavingsPercent("pro", currency),
    yearlySavingsPercent("business", currency),
  );
}
