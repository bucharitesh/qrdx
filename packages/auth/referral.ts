import { getOAuthState } from "better-auth/api";
import { OAUTH_LANDING_KEY, OAUTH_REFERRAL_KEY } from "./referral-keys";

// What a sign-up carries to the new account, handed to the app once, when
// the account is created:
//
// - an affiliate referral code (apps/docs/lib/affiliates). An email-code
//   sign-up sends it in the REFERRAL_HEADER request header; a Google or
//   GitHub sign-up sends it as the OAuth flow's additionalData
//   (OAUTH_REFERRAL_KEY), which Better Auth keeps in the OAuth state across
//   the provider's redirect;
// - how the visit started (apps/docs/lib/analytics/landing.ts): the
//   referring site's host, campaign tags and first page, in LANDING_HEADER
//   or OAUTH_LANDING_KEY the same way.
//
// Same visit only: no cookie or other stored value carries either.
//
// Nothing is trusted here: this only collects what the request carried. The
// app checks it (an approved affiliate, not the person themselves; every
// landing field sanitised again) and records it. This package has no tables
// for either, so the app registers the recorder (like the workspace audit
// log's, ./workspace-audit.ts). The recorder must not throw and returns at
// once; the app writes after the response. Nothing here ever stops a
// sign-up.

export {
  LANDING_HEADER,
  OAUTH_LANDING_KEY,
  OAUTH_REFERRAL_KEY,
  REFERRAL_HEADER,
} from "./referral-keys";

export interface NewUserSignUp {
  userId: string;
  email: string;
  /** The sign-up request's headers (REFERRAL_HEADER, LANDING_HEADER). */
  headers: Pick<Headers, "get"> | null;
  /** The code a Google or GitHub sign-up carried through the OAuth state. */
  oauthReferralCode: string | null;
  /**
   * How a Google or GitHub sign-up's visit started, as the OAuth state
   * carried it: an unchecked object (or null).
   */
  oauthLanding: Record<string, unknown> | null;
}

export type NewUserRecorder = (signUp: NewUserSignUp) => void;

// On globalThis so every copy of this module (Next.js can bundle one per
// server layer) sees the recorder the app registered.
const RECORDER = Symbol.for("@repo/auth/new-user-recorder");
type RecorderSlot = Record<symbol, NewUserRecorder | undefined>;

export function registerNewUserRecorder(recorder: NewUserRecorder): void {
  (globalThis as unknown as RecorderSlot)[RECORDER] = recorder;
}

type EndpointContext = {
  headers?: Pick<Headers, "get"> | null;
  request?: { headers?: Pick<Headers, "get"> } | null;
} | null;

interface OAuthCarried {
  referralCode: string | null;
  landing: Record<string, unknown> | null;
}

/** What the OAuth state carried, read in the user create `before` hook, by request. */
const oauthCarried = new WeakMap<object, OAuthCarried>();

/** Generous: the app's fields together are well under 1 KB. */
const MAX_LANDING_JSON = 2048;

/** The landing object as the state carried it: a small plain object, else null. */
function carriedLanding(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    return JSON.stringify(value).length <= MAX_LANDING_JSON
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const asContext = (value: unknown): EndpointContext =>
  value && typeof value === "object" ? (value as EndpointContext) : null;

/**
 * In the user create `before` hook, still inside the sign-up request: keeps
 * what a Google or GitHub sign-up carried in the OAuth state (a referral
 * code, how the visit started), for the `after` hook. Never throws.
 */
export async function noteSignUpState(ctx: unknown): Promise<void> {
  const context = asContext(ctx);
  if (!context) return;
  try {
    const state = await getOAuthState();
    const code = state?.[OAUTH_REFERRAL_KEY];
    const carried: OAuthCarried = {
      referralCode: typeof code === "string" && code ? code.slice(0, 64) : null,
      landing: carriedLanding(state?.[OAUTH_LANDING_KEY]),
    };
    if (carried.referralCode || carried.landing) {
      oauthCarried.set(context, carried);
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
export function recordNewUser(
  user: { id: string; email: string },
  ctx: unknown
): void {
  try {
    const recorder = (globalThis as unknown as RecorderSlot)[RECORDER];
    if (!recorder) {
      if (!warnedUnregistered) {
        warnedUnregistered = true;
        console.error(
          JSON.stringify({ event: "auth.new_user", outcome: "no_recorder" })
        );
      }
      return;
    }
    const context = asContext(ctx);
    const headers = context?.headers ?? context?.request?.headers ?? null;
    const carried = context ? oauthCarried.get(context) : undefined;
    recorder({
      userId: user.id,
      email: user.email,
      headers,
      oauthReferralCode: carried?.referralCode ?? null,
      oauthLanding: carried?.landing ?? null,
    });
  } catch (error) {
    // No ids, emails or codes in this log.
    console.error(
      JSON.stringify({
        event: "auth.new_user",
        outcome: "failed",
        error: error instanceof Error ? error.name : "unknown",
      })
    );
  }
}
