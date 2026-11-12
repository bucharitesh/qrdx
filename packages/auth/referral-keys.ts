// What a sign-up carries to the new account (./referral.ts). Client-safe:
// the sign-in panel sends these under the names below.

/** The request header an email-code sign-up sends an affiliate code in. */
export const REFERRAL_HEADER = "x-qrdx-referral";

/** The OAuth state key (additionalData) a Google or GitHub sign-up carries it in. */
export const OAUTH_REFERRAL_KEY = "referralCode";

/**
 * The request header an email-code sign-up sends how its visit started in
 * (apps/docs/lib/analytics/landing.ts): URI-encoded JSON.
 */
export const LANDING_HEADER = "x-qrdx-landing";

/** The OAuth state key a Google or GitHub sign-up carries the same in, as an object. */
export const OAUTH_LANDING_KEY = "landing";
