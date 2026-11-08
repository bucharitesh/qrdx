import type { BetterAuthOptions } from "better-auth";

// No new account from an address Google or GitHub hasn't verified. GitHub
// lets anyone add any address to their account, unverified, and Google
// says so in `email_verified`. Without this check, someone could create a
// GitHub account with your address, sign up to QRdx before you, add a
// passkey (which turns two-step verification on) and keep a way back in
// after you prove the address with an email code.
//
// Only creating an account is refused. Signing in to an account that's
// already linked is unchanged, and Better Auth itself won't link a provider
// that hasn't verified the address to an existing account. Anything other
// than a plain "verified" (false, or no answer at all) counts as unverified.
//
// The codes are client-safe: the sign-in page turns them into messages
// (apps/docs/app/(auth)/sign-in/_lib/error-message.ts).

type ValidateUserInfo = NonNullable<
  NonNullable<BetterAuthOptions["user"]>["validateUserInfo"]
>;

/** `?error=` codes for a refused sign-up, by provider. */
export const UNVERIFIED_SIGN_UP_ERROR = {
  github: "github_email_unverified",
  google: "google_email_unverified",
  /** Any other OAuth provider (none is configured today). */
  other: "oauth_email_unverified",
} as const;

export function unverifiedSignUpError(providerId: string | undefined): string {
  if (providerId === "github") return UNVERIFIED_SIGN_UP_ERROR.github;
  if (providerId === "google") return UNVERIFIED_SIGN_UP_ERROR.google;
  return UNVERIFIED_SIGN_UP_ERROR.other;
}

/**
 * The auth options' `user.validateUserInfo` for Google and GitHub: refuses
 * to create an account when the provider doesn't say the address is
 * verified. Every other method and action passes.
 */
export const validateSocialSignUp: ValidateUserInfo = ({ user, source }) => {
  if (source.method !== "oauth" || source.action !== "create-user") return;
  if (user.emailVerified === true) return;
  return {
    error: unverifiedSignUpError(source.oauth?.providerId),
    errorDescription:
      "The provider hasn't verified this email address, so no account was created.",
  };
};

/** Runs each check in turn; the first refusal wins. */
export function allUserInfoChecks(
  ...checks: ValidateUserInfo[]
): ValidateUserInfo {
  return async (data, context) => {
    for (const check of checks) {
      const result = await check(data, context);
      if (result?.error) return result;
    }
  };
}
