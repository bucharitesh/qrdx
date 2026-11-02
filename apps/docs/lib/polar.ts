import { createPolar, type Polar } from "@polar-sh/sdk/2026-10";
import { env } from "@/lib/env";

// Every call is gated on isBillingConfigured, so the empty fallback token is
// never sent. Request and response fields are snake_case since SDK 1.0.
export const polar: Polar = createPolar({
  accessToken: env.POLAR_ACCESS_TOKEN ?? "",
  environment: env.NODE_ENV === "production" ? "production" : "sandbox",
});

/** Billing needs a Polar access token; checkout also needs a product id. */
export const isBillingConfigured = Boolean(env.POLAR_ACCESS_TOKEN);

export const BILLING_NOT_CONFIGURED_MESSAGE = "Billing is not configured";

/** Shown while checkout is closed (feature "checkout", POLAR_CHECKOUT_ENABLED=0). */
export const CHECKOUT_CLOSED_MESSAGE =
  "Paid plans aren't open for checkout yet. Everything in Free works today.";
