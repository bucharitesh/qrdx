"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import { hasAnalyticsConsent } from "@/lib/analytics/server";
import { baseUrl } from "@/lib/metadata";
import {
  BILLING_NOT_CONFIGURED_MESSAGE,
  isBillingConfigured,
  polar,
} from "@/lib/polar";
import { type BillingInterval, type PaidPlan, PRICING } from "@/lib/pricing";
import { getCurrentUser, logError } from "@/lib/shared";
import { getMyActiveSubscription } from "@/lib/subscription";
import { UnauthorizedError } from "@/types/errors";
import { getOrCreateCustomer } from "./customer";

const checkoutSchema = z.object({
  plan: z.enum(["pro", "business"]),
  interval: z.enum(["month", "year"]),
});

export type CheckoutResult =
  | { url: string }
  | {
      error: string;
      /** sign_in: no session; subscribed: change plans in the billing portal */
      reason?: "sign_in" | "subscribed" | "unavailable";
    };

// Each attempt creates a Polar checkout session.
const checkoutLimiter = createRateLimiter({
  limiter: slidingWindow(10, "10 m"),
});

export async function createCheckout(input: {
  plan: PaidPlan;
  interval: BillingInterval;
}): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a plan and billing period." };
  const { plan, interval } = parsed.data;

  // The same product for every region: each one has a USD and an INR price
  // and Polar picks the currency from the customer's location.
  const productId = PRICING[plan][interval].productId;
  if (!(isBillingConfigured && productId)) {
    return { error: BILLING_NOT_CONFIGURED_MESSAGE, reason: "unavailable" };
  }

  try {
    const user = await getCurrentUser();

    const { success } = await checkoutLimiter.limit(`checkout:${user.id}`);
    if (!success) {
      return {
        error: "Too many checkout attempts. Please try again in a few minutes.",
      };
    }

    // One subscription per account; upgrades and downgrades go through the
    // billing portal so nobody pays twice.
    if (await getMyActiveSubscription(user.id)) {
      return {
        error:
          "You already have a subscription. Change your plan in the billing portal.",
        reason: "subscribed",
      };
    }

    const customer = await getOrCreateCustomer(user);
    const checkout = await polar.checkouts.create({
      products: [productId],
      customerId: customer?.id,
      metadata: {
        plan,
        interval,
        // Lets the webhook attribute subscription_activated to this user in
        // PostHog; without analytics consent it is an anonymous count.
        ...((await hasAnalyticsConsent()) ? { analytics_consent: "1" } : {}),
      },
      successUrl: `${baseUrl.origin}/success?checkout_id={CHECKOUT_ID}`,
      returnUrl: `${baseUrl.origin}/pricing`,
    });

    return { url: checkout.url };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { error: "Sign in to upgrade.", reason: "sign_in" };
    }
    logError(error as Error, { action: "createCheckout", plan, interval });
    return { error: "Failed to create checkout" };
  }
}
