import { getOAuthState } from "better-auth/api";
import { OAUTH_REFERRAL_KEY } from "./referral-keys";

// Affiliate referrals at sign-up (apps/docs/lib/affiliates). A new account is
// attributed to an affiliate once, when it's created, from a referral code
// the sign-up itself carries:
//
// - an email-code sign-up sends it in the REFERRAL_HEADER request header;
// - a Google or GitHub sign-up sends it as the OAuth flow's additionalData
//   (OAUTH_REFERRAL_KEY), which Better Auth keeps in the OAuth state across
//   the provider's redirect.
//
// Same visit only: no cookie or other stored value carries a code.
//
// No code is trusted here: this only collects what the request carried. The
// app checks it (an approved affiliate, not the person themselves) and
// records it. This package has no affiliate tables of its own, so the app
// registers the recorder (like the workspace audit log's, ./workspace-audit.ts).
// The recorder must not throw and returns at once; the app writes after the
// response. Nothing here ever stops a sign-up.

export { OAUTH_REFERRAL_KEY, REFERRAL_HEADER } from "./referral-keys";

export interface NewUserSignUp {
  userId: string;
  email: string;
  /** The sign-up request's headers (REFERRAL_HEADER). */
  headers: Pick<Headers, "get"> | null;
  /** The code a Google or GitHub sign-up carried through the OAuth state. */
  oauthReferralCode: string | null;
}

export type NewUserReferralRecorder = (signUp: NewUserSignUp) => void;

// On globalThis so every copy of this module (Next.js can bundle one per
// server layer) sees the recorder the app registered.
const RECORDER = Symbol.for("@repo/auth/new-user-referral-recorder");
type RecorderSlot = Record<symbol, NewUserReferralRecorder | undefined>;

export function registerNewUserReferralRecorder(
  recorder: NewUserReferralRecorder
): void {
  (globalThis as unknown as RecorderSlot)[RECORDER] = recorder;
}

type EndpointContext = {
  headers?: Pick<Headers, "get"> | null;
  request?: { headers?: Pick<Headers, "get"> } | null;
} | null;

/** The OAuth codes read in the user create `before` hook, by request. */
const oauthCodes = new WeakMap<object, string>();

const asContext = (value: unknown): EndpointContext =>
  value && typeof value === "object" ? (value as EndpointContext) : null;

/**
 * In the user create `before` hook, still inside the sign-up request: keeps
 * the referral code a Google or GitHub sign-up carried, for the `after`
 * hook. Never throws.
 */
export async function noteSignUpReferral(ctx: unknown): Promise<void> {
  const context = asContext(ctx);
  if (!context) return;
  try {
    const state = await getOAuthState();
    const value = state?.[OAUTH_REFERRAL_KEY];
    if (typeof value === "string" && value) {
      oauthCodes.set(context, value.slice(0, 64));
    }
  } catch {
    // Not an OAuth request (an email code): nothing to keep.
  }
}

let warnedUnregistered = false;

/**
 * In the user create `after` hook: hands the new account and what its
 * sign-up carried to the app's recorder. Never throws.
 */
export function recordNewUserReferral(
  user: { id: string; email: string },
  ctx: unknown
): void {
  try {
    const recorder = (globalThis as unknown as RecorderSlot)[RECORDER];
    if (!recorder) {
      if (!warnedUnregistered) {
        warnedUnregistered = true;
        console.error(
          JSON.stringify({ event: "auth.referral", outcome: "no_recorder" })
        );
      }
      return;
    }
    const context = asContext(ctx);
    const headers = context?.headers ?? context?.request?.headers ?? null;
    recorder({
      userId: user.id,
      email: user.email,
      headers,
      oauthReferralCode: context ? (oauthCodes.get(context) ?? null) : null,
    });
  } catch (error) {
    // No ids, emails or codes in this log.
    console.error(
      JSON.stringify({
        event: "auth.referral",
        outcome: "failed",
        error: error instanceof Error ? error.name : "unknown",
      })
    );
  }
}
