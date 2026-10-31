import { Polar } from "@polar-sh/sdk";
import { env } from "@/lib/env";

export const polar = new Polar({
  accessToken: env.POLAR_ACCESS_TOKEN,
  server: env.NODE_ENV === "production" ? "production" : "sandbox",
});

/** Billing needs a Polar access token; checkout also needs a product id. */
export const isBillingConfigured = Boolean(env.POLAR_ACCESS_TOKEN);

export const BILLING_NOT_CONFIGURED_MESSAGE = "Billing is not configured";
