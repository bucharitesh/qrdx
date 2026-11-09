// The stolen-session check: the pure parts, shared by Better Auth's side
// (./session-origin.ts), the app (apps/docs/lib/account/session-origin*.ts)
// and tests. Client-safe.
//
// A session remembers where it started: the country of the request that
// signed in and its browser family ("Chrome on macOS"). When a later request
// on that session comes from a different country AND a different browser
// family, the session is held: it reads as signed out everywhere except
// "Confirm it's you", which, once answered, makes the current place the
// session's new origin. One of the two changing isn't enough (travelling with
// the same laptop; a new browser at home), and a request whose country isn't
// known (no header: self-hosted, local development) never triggers it.

export const SESSION_ORIGIN_IDENTIFIER_PREFIX = "qrdx-session-origin-";

/**
 * Where a session started: a `verification` row named by this and the
 * session's id, holding the country code, expiring with the session. The
 * browser family is read from the session row's own user agent, which Better
 * Auth records when it creates the session (and the app rewrites when the
 * origin moves).
 */
export function sessionOriginIdentifier(sessionId: string): string {
  return `${SESSION_ORIGIN_IDENTIFIER_PREFIX}${sessionId}`;
}

/**
 * A session ends 30 days after its sign-in, so its origin row lasts that
 * long and is never rewritten as Better Auth extends the session (no write
 * on every refresh). A session that somehow outlives it takes its row along
 * (./session-origin.ts).
 */
export const SESSION_ORIGIN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When a session's origin row expires: the later of the two. */
export function originExpiresAt(session: {
  createdAt: Date | string;
  expiresAt: Date | string;
}): Date {
  const cap =
    new Date(session.createdAt).getTime() + SESSION_ORIGIN_DAYS * DAY_MS;
  return new Date(Math.max(cap, new Date(session.expiresAt).getTime()));
}

/** Where a request comes from, as far as this check cares. */
export interface RequestPlace {
  /** ISO 3166-1 alpha-2 country ("IN"); null when the request didn't say */
  country: string | null;
  /** Browser and system names without versions ("Chrome on macOS") */
  browser: string;
}

/**
 * How the app reads a request's place: the country from the hosting
 * platform's headers, the browser family from a user agent. Registered by
 * the app (this package doesn't know the platform's headers or parse user
 * agents), on globalThis so every copy of this module sees it.
 */
export interface SessionOriginReader {
  country(headers: Headers): string | null;
  browser(userAgent: string | null): string;
}

const READER = Symbol.for("@repo/auth/session-origin-reader");
type ReaderSlot = Record<symbol, SessionOriginReader | undefined>;

export function registerSessionOriginReader(reader: SessionOriginReader): void {
  (globalThis as unknown as ReaderSlot)[READER] = reader;
}

export function sessionOriginReader(): SessionOriginReader | null {
  return (globalThis as unknown as ReaderSlot)[READER] ?? null;
}

/**
 * Whether a request at `now` must confirm it's the person who signed in at
 * `started`: both countries known and different, and the browser family
 * different too.
 */
export function originChanged(
  started: RequestPlace,
  now: RequestPlace
): boolean {
  if (!(started.country && now.country)) return false;
  return started.country !== now.country && started.browser !== now.browser;
}

/**
 * Better Auth endpoints a held session's browser may still reach over HTTP.
 * None of them acts on the held session: they sign it out or sign in afresh
 * (a new session starts with a new origin), and /get-session answers as if
 * signed out (./session-origin.ts). Everything else answers
 * CONFIRMATION_REQUIRED.
 */
export const HELD_SESSION_OPEN_PATHS: readonly string[] = [
  "/get-session",
  "/sign-out",
  "/ok",
  "/error",
  // Signing in again
  "/sign-in/social",
  "/sign-in/email-otp",
  "/email-otp/send-verification-otp",
  "/callback/:id",
  "/passkey/generate-authenticate-options",
  "/passkey/verify-authentication",
  "/sign-in/sso",
  "/sso/callback",
  "/sso/callback/:providerId",
  "/sso/saml2/sp/acs/:providerId",
  // Its second step (./sign-in-challenge-rules.ts): these need a pending
  // challenge and refuse a signed-in browser.
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/two-factor/methods",
  "/two-factor/passkey/options",
  "/two-factor/passkey/verify",
  "/two-factor/continue",
];

/**
 * Passed as `query` to auth.api.getSession by the app's few places that
 * must see a held session: the proxy (to send it to the check page instead
 * of signing in), "Confirm it's you" and its gated actions (which answer
 * CONFIRMATION_REQUIRED). A symbol, so no HTTP request can carry it; requests
 * are refused it anyway.
 */
export const SESSION_HOLD_AWARE = Symbol.for("@repo/auth/session-hold-aware");

export function holdAwareQuery(): Record<symbol, true> {
  return { [SESSION_HOLD_AWARE]: true };
}
