// What /sign-in says when a sign-in comes back refused (`?error=<code>`).
// Google and GitHub come back with `?via=<provider>` as well
// (socialSignInErrorPath), so their failures name the provider; anything
// else is a workspace single sign-on and keeps SSO's own messages
// (ee/sso/messages.ts). Pure and client-safe.

import { SSO_REQUIRED_ERROR } from "@repo/auth/sso-required-rules";
import { UNVERIFIED_SIGN_UP_ERROR } from "@repo/auth/verified-sign-up";
import { ssoSignInErrorMessage } from "@/ee/sso/messages";
import { signInPath } from "@/lib/safe-redirect";

export const SOCIAL_SIGN_INS = ["google", "github"] as const;
export type SocialSignIn = (typeof SOCIAL_SIGN_INS)[number];

const LABELS: Record<SocialSignIn, string> = {
  google: "Google",
  github: "GitHub",
};

export function isSocialSignIn(value: unknown): value is SocialSignIn {
  return (SOCIAL_SIGN_INS as readonly unknown[]).includes(value);
}

/** Where a Google or GitHub sign-in that fails comes back to: this page. */
export function socialSignInErrorPath(next: string, via: SocialSignIn): string {
  const path = signInPath(next);
  return `${path}${path.includes("?") ? "&" : "?"}via=${via}`;
}

export function signInErrorMessage(
  code: string,
  via: SocialSignIn | null,
): string {
  switch (code) {
    case UNVERIFIED_SIGN_UP_ERROR.github:
      return "GitHub hasn't verified this email address, so QRdx can't create an account with it. Verify it in your GitHub email settings and try again, or sign in with an email code.";
    case UNVERIFIED_SIGN_UP_ERROR.google:
      return "Google hasn't verified this email address, so QRdx can't create an account with it. Sign in with an email code instead.";
    case UNVERIFIED_SIGN_UP_ERROR.other:
      return "That account's email address isn't verified, so QRdx can't create an account with it. Sign in with an email code instead.";
    // Google or GitHub for an address whose company requires SSO.
    case SSO_REQUIRED_ERROR:
      return ssoSignInErrorMessage(code);
  }
  if (!via) return ssoSignInErrorMessage(code);
  const label = LABELS[via];
  switch (code) {
    case "access_denied":
      return "Sign-in was cancelled.";
    case "account_not_linked":
      return `An account with this address already exists and isn't linked to ${label}. Sign in with an email code instead.`;
    case "email_not_found":
      return `${label} didn't share an email address, so QRdx can't sign you in with it. Sign in with an email code instead.`;
    case "state_mismatch":
    case "state_not_found":
    case "state_invalid":
    case "please_restart_the_process":
      return "That sign-in took too long or was started elsewhere. Try again.";
    default:
      return `${label} sign-in didn't work. Try again, or sign in another way.`;
  }
}
