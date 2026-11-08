// Pure and client-safe: what the app and Better Auth's side of "Confirm it's
// you" agree on (./confirm-sign-in.ts, ./new-sign-in.ts, ./ee/sso-rules.ts,
// apps/docs/lib/account/confirmation.ts and confirmation-server.tsx).

/** How long a confirmation lasts for the session that made it. */
export const CONFIRMATION_MINUTES = 10;

/**
 * A confirmation is a `verification` row named by this prefix and the
 * session's id, holding the user's id, for CONFIRMATION_MINUTES. The app
 * writes one when someone confirms; ./new-sign-in.ts writes one when a
 * finished sign-in proved as much.
 */
export const CONFIRMED_IDENTIFIER_PREFIX = "qrdx-confirmed-";

export function confirmedIdentifier(sessionId: string): string {
  return `${CONFIRMED_IDENTIFIER_PREFIX}${sessionId}`;
}

/** The page signing in again comes back to carries `?confirm=<outcome>`. */
export const CONFIRM_RETURN_PARAM = "confirm";
export const CONFIRM_RETURNED = "signed-in";
export const CONFIRM_RETURN_FAILED = "sign-in-failed";

/**
 * The `?error=` when the sign-in was refused because it wasn't the person
 * who asked: an account that isn't linked (no new one is made) or someone
 * else's.
 */
export const CONFIRM_SIGN_IN_WRONG_ACCOUNT = "confirm_sign_in_wrong_account";
