// The referral code in the browser (client-safe, no server imports).
//
// Without any consent: the code from the link (/?ref=<code>) is kept in this
// tab's memory and in the address bar, and the sign-in panel sends it along
// with a sign-up (a request header for email codes, the OAuth state for
// Google and GitHub). Nothing is written to the device.
//
// With Analytics allowed (components/consent/referral-capture.tsx): the code
// is also kept in the qrdx_ref cookie for 30 days, so a sign-up on a later
// visit counts too. The first code wins: an existing cookie isn't replaced.
// Withdrawing Analytics deletes it (components/consent/config.ts).
import { parseReferralCode } from "./rules";
import {
  AFFILIATE_REF_PARAM,
  AFFILIATE_REFERRAL_COOKIE,
  AFFILIATE_REFERRAL_COOKIE_DAYS,
} from "./terms";

let pending: string | null = null;

function codeInAddressBar(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return parseReferralCode(
      new URLSearchParams(window.location.search).get(AFFILIATE_REF_PARAM),
    );
  } catch {
    return null;
  }
}

/** Keeps the address bar's code (if any) for the rest of this tab's visit. */
export function captureReferralFromUrl(): string | null {
  const code = codeInAddressBar();
  if (code && !pending) pending = code;
  return pending;
}

/** The code this tab's sign-up should carry, if it has one. */
export function pendingReferralCode(): string | null {
  return pending ?? codeInAddressBar();
}

/** Clears the in-memory code (tests). */
export function forgetPendingReferral(): void {
  pending = null;
}

export function hasReferralCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${AFFILIATE_REFERRAL_COOKIE}=`));
}

/**
 * Writes the qrdx_ref cookie, unless one is already there (the first link
 * wins). Call it only once the visitor has allowed Analytics.
 */
export function storeReferralCookie(code: string): boolean {
  if (typeof document === "undefined") return false;
  const valid = parseReferralCode(code);
  if (!valid || hasReferralCookie()) return false;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const maxAge = AFFILIATE_REFERRAL_COOKIE_DAYS * 24 * 60 * 60;
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API isn't in Safari or Firefox.
  document.cookie = `${AFFILIATE_REFERRAL_COOKIE}=${encodeURIComponent(valid)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  return true;
}
