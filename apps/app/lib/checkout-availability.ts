import "server-only";

import type { CheckoutOpen } from "@/app/(app)/settings/usage/_lib/meters";
import { isBillingConfigured } from "@/lib/polar";
import { BILLING_INTERVALS, type PaidPlan, PRICING } from "@/lib/pricing";

/**
 * Paid plans checkout can sell on this deployment right now: Polar is
 * configured and the plan has a product for at least one billing period.
 * The pricing page shows "Coming soon" for the others (pricing-section.tsx),
 * so in-app upgrade buttons leave them out too.
 */
export function getCheckoutOpen(): CheckoutOpen {
  const open = (plan: PaidPlan) =>
    isBillingConfigured &&
    BILLING_INTERVALS.some((interval) =>
      Boolean(PRICING[plan][interval].productId),
    );
  return { pro: open("pro"), business: open("business") };
}
