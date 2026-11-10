// Where a sign-up carries an affiliate referral code (./referral.ts).
// Client-safe: the sign-in panel sends the code under these names.

/** The request header an email-code sign-up sends the code in. */
export const REFERRAL_HEADER = "x-qrdx-referral";

/** The OAuth state key (additionalData) a Google or GitHub sign-up carries it in. */
export const OAUTH_REFERRAL_KEY = "referralCode";
