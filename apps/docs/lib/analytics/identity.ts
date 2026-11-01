import type { SignInMethod } from "./events";
import { setPostHogUser } from "./posthog";
import { resetAnalytics, track } from "./track";

/**
 * Keeps analytics in step with the Better Auth session: PostHog identifies
 * by user id (never email) with coarse person properties, groups by team,
 * and resets on sign-out. A session that started moments ago is a fresh
 * sign-in (or a sign-up, when the account is as new as the session), which
 * catches social sign-ins after their redirect as well as email codes.
 */
export type AnalyticsSession = {
  userId: string;
  userCreatedAt: number;
  sessionCreatedAt: number;
  organizationId: string | null;
} | null;

const FRESH_SESSION_MS = 2 * 60_000;
const NEW_ACCOUNT_MS = 60_000;
/** Holds the start time of the last session counted, so reloads don't recount. */
const COUNTED_KEY = "qrdx:analytics-auth";

const METHODS = new Set<SignInMethod>(["google", "github", "email-otp"]);

export function toSignInMethod(
  method: string | null | undefined,
): SignInMethod {
  return METHODS.has(method as SignInMethod)
    ? (method as SignInMethod)
    : "unknown";
}

/** sign_up / sign_in for a session that just started, else null. */
export function authEventFor(
  session: NonNullable<AnalyticsSession>,
  now: number,
): "sign_up" | "sign_in" | null {
  if (now - session.sessionCreatedAt > FRESH_SESSION_MS) return null;
  return Math.abs(session.sessionCreatedAt - session.userCreatedAt) <
    NEW_ACCOUNT_MS
    ? "sign_up"
    : "sign_in";
}

function claimSession(sessionCreatedAt: number): boolean {
  try {
    const marker = String(sessionCreatedAt);
    if (window.sessionStorage.getItem(COUNTED_KEY) === marker) return false;
    window.sessionStorage.setItem(COUNTED_KEY, marker);
  } catch {}
  return true;
}

/** "2026-11-01": the signup day is enough. */
function isoDay(time: number): string | undefined {
  return Number.isFinite(time)
    ? new Date(time).toISOString().slice(0, 10)
    : undefined;
}

let lastUserId: string | null | undefined;

export function syncAnalyticsSession(
  session: AnalyticsSession,
  lastLoginMethod: () => string | null,
): void {
  if (!session) {
    // Signed out in this tab (or arrived signed out).
    if (lastUserId) resetAnalytics();
    else setPostHogUser(null, null);
    lastUserId = null;
    return;
  }

  setPostHogUser(
    {
      id: session.userId,
      properties: { signup_date: isoDay(session.userCreatedAt) },
    },
    session.organizationId,
  );

  const event = authEventFor(session, Date.now());
  if (
    event &&
    lastUserId !== session.userId &&
    claimSession(session.sessionCreatedAt)
  ) {
    track(event, { method: toSignInMethod(lastLoginMethod()) });
  }
  lastUserId = session.userId;
}

/** Test hook. */
export function __resetIdentityForTests() {
  lastUserId = undefined;
}
