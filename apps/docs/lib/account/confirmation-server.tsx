import "server-only";

import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  confirmedIdentifier,
  strongConfirmedIdentifier as strongIdentifier,
} from "@repo/auth/confirm-sign-in-rules";
import { cookiesToSet } from "@repo/auth/passkey";
import { auth } from "@repo/auth/server";
import { LOCKOUT_FAILURES } from "@repo/auth/sign-in-challenge-rules";
import {
  database as db,
  session as sessionTable,
  verification,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import {
  addressKey,
  addressMayRequestCode,
  deliverSignInCode,
} from "@/lib/auth/sign-in-code-delivery";
import {
  isTotpCode,
  normalizeBackupCode,
  TWO_FACTOR_MESSAGES,
} from "@/lib/auth/two-factor";
import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  CONFIRMATION_CODE_SUBJECT,
  ConfirmationCodeEmail,
} from "@/lib/email/templates/confirmation-code";
import { currentRequestDetails } from "@/lib/security/request-details";
import { logError } from "@/lib/shared";
import {
  CONFIRMATION_CODE_ATTEMPTS,
  CONFIRMATION_CODE_MINUTES,
  CONFIRMATION_MESSAGES,
  CONFIRMATION_MINUTES,
  type ConfirmationOptions,
  type ConfirmationRequired,
  confirmationMethodsFor,
  confirmationRequired,
  mailProviderFor,
  maskEmail,
} from "./confirmation";
import { isRecentSignIn } from "./deletion";
import { linkedSignInsFor } from "./linked-sign-ins-server";
import { PASSKEY_MESSAGES } from "./passkeys";
import { signInCodesAvailable } from "./reauth";
import {
  getSessionAllowingHold,
  isSessionHeld,
  moveSessionOrigin,
} from "./session-origin-server";
import { hasAuthenticatorApp } from "./two-factor-methods";
import { sendBackupCodeUsedNotice } from "./two-factor-notice-server";
import {
  clearCodeFailures,
  loadTwoFactorFacts,
  passkeysWorkHere,
  reserveCodeAttempt,
} from "./two-factor-server";

// "Confirm it's you" on the server (./confirmation.ts has the rules). A
// confirmation is a `verification` row keyed by the session's id, holding the
// user's id, for 10 minutes; no schema change. With two-step verification on,
// wrong answers count toward the same lockout as sign-in codes
// (reserveCodeAttempt): 10 in a row lock the account's codes and passkey
// checks for 15 minutes. Emailed codes, for accounts without it, are HMAC'd
// with the auth secret and allow 3 tries each. Signing in again with Google,
// GitHub or SSO is ./confirmation-sign-in-server.ts.
//
// A held session (used from a new country and browser: ./session-origin.ts)
// is seen here, unlike everywhere else, so it can confirm: until it does,
// every gated action answers CONFIRMATION_REQUIRED, even with a confirmation
// recorded before it was held. Every confirmation moves the session's
// origin to where it is now.

export type ConfirmResult = { ok: true } | { ok: false; error: string };

/** The signed-in session a confirmation belongs to. */
export interface ConfirmableSession {
  userId: string;
  email: string;
  sessionId: string;
  sessionCreatedAt: Date;
  requestHeaders: Headers;
  /**
   * Used from a different country and browser than where it started: it
   * must confirm before anything else.
   */
  held?: boolean;
}

const CODE_PREFIX = "qrdx-confirm-code-";
const codeIdentifier = (sessionId: string) => `${CODE_PREFIX}${sessionId}`;

// Per user, on top of the account lockout (auth.api calls skip Better Auth's
// own HTTP rate limiter). Without Redis these allow everything; the lockout
// and the per-code tries still apply.
const answerLimiter = createRateLimiter({
  prefix: "qrdx:confirm-answer",
  limiter: slidingWindow(10, "15 m"),
});
const passkeyOptionsLimiter = createRateLimiter({
  prefix: "qrdx:confirm-passkey-options",
  limiter: slidingWindow(20, "15 m"),
});
const sendLimiter = createRateLimiter({
  prefix: "qrdx:confirm-code-send",
  limiter: slidingWindow(5, "15 m"),
});
// Per address, like sign-in codes: a burst window and a daily cap.
const perAddressLimiter = createRateLimiter({
  prefix: "qrdx:confirm-code",
  limiter: slidingWindow(5, "15 m"),
});
const perAddressDailyLimiter = createRateLimiter({
  prefix: "qrdx:confirm-code-day",
  limiter: slidingWindow(30, "1 d"),
});

const fail = (error: string): ConfirmResult => ({ ok: false, error });

/** What a Better Auth APIError carries (auth.api throws these). */
const authErrorCode = (error: unknown): string | undefined =>
  (error as { body?: { code?: string } } | null)?.body?.code;

/** The signed-in session, read from the request, held or not. */
export async function currentSession(): Promise<ConfirmableSession | null> {
  const requestHeaders = await headers();
  const found = await getSessionAllowingHold(requestHeaders);
  if (!found?.session?.id) return null;
  return {
    userId: found.user.id,
    email: found.user.email,
    sessionId: found.session.id,
    sessionCreatedAt: new Date(found.session.createdAt),
    requestHeaders,
    held: await isSessionHeld(found.session, requestHeaders),
  };
}

// ─── The confirmation record ─────────────────────────────────────────────────

async function hasRow(identifier: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: verification.id })
    .from(verification)
    .where(
      and(
        eq(verification.identifier, identifier),
        eq(verification.value, userId),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** This session confirmed within the last 10 minutes (and isn't held). */
export async function hasRecentConfirmation(
  session: Pick<ConfirmableSession, "userId" | "sessionId" | "held">,
): Promise<boolean> {
  if (session.held) return false;
  return hasRow(confirmedIdentifier(session.sessionId), session.userId);
}

/**
 * This session confirmed within the last 10 minutes with a passkey, an
 * authenticator code or a backup code: never an emailed code or signing in
 * again, which getting into a mailbox or a Google account is enough for.
 * Never while the session is held.
 */
export async function hasRecentStrongConfirmation(
  session: Pick<ConfirmableSession, "userId" | "sessionId" | "held">,
): Promise<boolean> {
  if (session.held) return false;
  return hasRow(strongIdentifier(session.sessionId), session.userId);
}

/**
 * For gated actions: null when this session confirmed in the last 10 minutes
 * (or, without two-step verification on a deployment that can't send codes,
 * signed in within them), else the result the action returns so the client
 * asks. A held session always asks.
 */
export async function requireRecentConfirmation(
  session: Pick<
    ConfirmableSession,
    "userId" | "sessionId" | "sessionCreatedAt" | "held"
  >,
): Promise<ConfirmationRequired | null> {
  if (session.held) return confirmationRequired();
  if (await hasRecentConfirmation(session)) return null;
  if (!signInCodesAvailable()) {
    const { on } = await loadTwoFactorFacts(session.userId);
    if (!on && isRecentSignIn(session.sessionCreatedAt, new Date())) {
      return null;
    }
  }
  return confirmationRequired();
}

/**
 * For gated actions: the signed-in session when it confirmed recently, else
 * the result to return (signed out, or CONFIRMATION_REQUIRED).
 */
export async function confirmedSession(
  signedOutMessage: string,
): Promise<
  { ok: true; session: ConfirmableSession } | { ok: false; error: string }
> {
  const session = await currentSession();
  if (!session) return fail(signedOutMessage) as { ok: false; error: string };
  const needed = await requireRecentConfirmation(session);
  if (needed) return needed;
  return { ok: true, session };
}

/**
 * Starts (or restarts) this session's 10 minutes; `strong` when it used a
 * passkey, an authenticator code or a backup code. With the request's
 * headers, where the session is now also becomes its origin (a held session
 * is let go).
 */
export async function recordConfirmation(
  session: Pick<ConfirmableSession, "userId" | "sessionId"> &
    Partial<Pick<ConfirmableSession, "requestHeaders">>,
  { strong = false }: { strong?: boolean } = {},
): Promise<void> {
  await writeConfirmationRow(
    confirmedIdentifier(session.sessionId),
    session.userId,
  );
  if (strong) {
    await writeConfirmationRow(
      strongIdentifier(session.sessionId),
      session.userId,
    );
  }
  if (session.requestHeaders) {
    await moveSessionOrigin(session, session.requestHeaders);
  }
}

async function writeConfirmationRow(
  identifier: string,
  userId: string,
): Promise<void> {
  const now = new Date();
  await db.batch([
    db.delete(verification).where(eq(verification.identifier, identifier)),
    db.insert(verification).values({
      id: randomUUID(),
      identifier,
      value: userId,
      expiresAt: new Date(now.getTime() + CONFIRMATION_MINUTES * 60_000),
      createdAt: now,
      updatedAt: now,
    }),
  ]);
}

/**
 * Better Auth swaps the session for a new one when an authenticator app turns
 * two-step verification on; the confirmation moves with it, so the person
 * isn't asked again straight away. `setCookie` is the swap's Set-Cookie.
 */
export async function carryConfirmation(
  from: Pick<ConfirmableSession, "userId" | "sessionId">,
  setCookie: string | null | undefined,
): Promise<void> {
  const token = sessionTokenFromSetCookie(setCookie);
  if (!token) return;
  const [next] = await db
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(
      and(eq(sessionTable.token, token), eq(sessionTable.userId, from.userId)),
    )
    .limit(1);
  if (!next) return;
  for (const identifier of [confirmedIdentifier, strongIdentifier]) {
    await db
      .update(verification)
      .set({ identifier: identifier(next.id), updatedAt: new Date() })
      .where(
        and(
          eq(verification.identifier, identifier(from.sessionId)),
          eq(verification.value, from.userId),
          gt(verification.expiresAt, new Date()),
        ),
      );
  }
}

/**
 * The session token in Better Auth's Set-Cookie (`<token>.<signature>`,
 * URL-encoded), or null. Only used to find the new session's id.
 */
export function sessionTokenFromSetCookie(
  setCookie: string | null | undefined,
): string | null {
  const match = setCookie?.match(
    /(?:^|[\s,])(?:__Secure-)?[\w.-]*session_token=([^;,\s]+)/,
  );
  if (!match?.[1]) return null;
  let value: string;
  try {
    value = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  const dot = value.lastIndexOf(".");
  return dot > 0 ? value.slice(0, dot) : null;
}

// ─── What the dialog offers ──────────────────────────────────────────────────

export async function loadConfirmationOptions(
  session: ConfirmableSession,
): Promise<ConfirmationOptions> {
  const facts = await loadTwoFactorFacts(session.userId);
  return {
    methods: confirmationMethodsFor({
      twoFactorOn: facts.on,
      authenticatorApp: facts.on && hasAuthenticatorApp(facts.row),
      passkeys: passkeysWorkHere(session.requestHeaders) ? facts.passkeys : 0,
      emailCodes: signInCodesAvailable(),
      signIns: facts.on ? [] : await linkedSignInsFor(session),
    }),
    maskedEmail: maskEmail(session.email),
    mailProvider: mailProviderFor(session.email),
  };
}

// ─── Authenticator and backup codes ──────────────────────────────────────────

/**
 * Checks an authenticator or backup code (a backup code is used up) against
 * the shared lockout. An account without an authenticator app (passkeys
 * only, or a setup that was never confirmed) never gets as far as the
 * plugin's TOTP check. A backup code that worked is emailed to the
 * account's address, without waiting for it: that never holds up or fails
 * the check.
 */
export async function checkSecondFactorCode(
  session: Pick<ConfirmableSession, "userId" | "email" | "requestHeaders">,
  rawCode: string,
): Promise<ConfirmResult> {
  const totpCode = isTotpCode(rawCode.trim()) ? rawCode.trim() : null;
  const backupCode = totpCode ? null : normalizeBackupCode(rawCode);
  if (!(totpCode || backupCode)) {
    return fail(
      /^[\d\s]+$/.test(rawCode.trim())
        ? TWO_FACTOR_MESSAGES.invalidCode
        : TWO_FACTOR_MESSAGES.invalidBackupCode,
    );
  }

  const facts = await loadTwoFactorFacts(session.userId);
  if (!(facts.on && facts.row)) return fail(CONFIRMATION_MESSAGES.failed);
  if (totpCode && !hasAuthenticatorApp(facts.row)) {
    return fail(CONFIRMATION_MESSAGES.noAuthenticatorApp);
  }
  if (!(await answerLimiter.limit(session.userId)).success) {
    return fail(CONFIRMATION_MESSAGES.rateLimited);
  }
  const attempt = await reserveCodeAttempt(session.userId);
  if (!attempt.ok) {
    return fail(
      attempt.reason === "locked"
        ? TWO_FACTOR_MESSAGES.locked
        : CONFIRMATION_MESSAGES.failed,
    );
  }

  try {
    if (totpCode) {
      await auth.api.verifyTOTP({
        headers: session.requestHeaders,
        body: { code: totpCode },
      });
    } else {
      await auth.api.verifyBackupCode({
        headers: session.requestHeaders,
        body: { code: backupCode as string, disableSession: true },
      });
    }
  } catch (error) {
    const code = authErrorCode(error);
    if (code !== "INVALID_CODE" && code !== "INVALID_BACKUP_CODE") throw error;
    // Already counted; the attempt that reached the limit set the lock.
    if (attempt.attempts >= LOCKOUT_FAILURES) {
      return fail(TWO_FACTOR_MESSAGES.locked);
    }
    return fail(
      totpCode
        ? TWO_FACTOR_MESSAGES.wrongCode
        : TWO_FACTOR_MESSAGES.wrongBackupCode,
    );
  }
  await clearCodeFailures(attempt.id);
  if (backupCode) {
    try {
      // Started now (the count of codes left is read before the action
      // this confirms can make new ones), never awaited.
      const sending = sendBackupCodeUsedNotice({
        userId: session.userId,
        email: session.email,
        usedFor: "confirm",
        headers: session.requestHeaders,
      });
      after(() => sending);
    } catch (error) {
      logError(error as Error, { action: "account.backupCodeNotice" });
    }
  }
  return { ok: true };
}

export async function confirmWithCode(input: unknown): Promise<ConfirmResult> {
  const parsed = z.object({ code: z.string().max(64) }).safeParse(input);
  if (!parsed.success) return fail(TWO_FACTOR_MESSAGES.invalidCode);
  try {
    const session = await currentSession();
    if (!session) return fail(CONFIRMATION_MESSAGES.signedOut);
    const check = await checkSecondFactorCode(session, parsed.data.code);
    if (!check.ok) return check;
    await recordConfirmation(session, { strong: true });
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.confirmWithCode" });
    return fail(CONFIRMATION_MESSAGES.failed);
  }
}

// ─── Passkeys ────────────────────────────────────────────────────────────────

/**
 * Options for the browser's passkey prompt, limited to this person's
 * passkeys, with user verification required. The plugin keeps the challenge
 * (single use, minutes long) behind a signed cookie, passed on here.
 */
export async function passkeyAssertionOptions(
  session: ConfirmableSession,
): Promise<{ ok: true; options: Record<string, unknown> } | ConfirmResult> {
  if (!passkeysWorkHere(session.requestHeaders)) {
    return fail(CONFIRMATION_MESSAGES.passkeyUnavailable);
  }
  if (!(await passkeyOptionsLimiter.limit(session.userId)).success) {
    return fail(CONFIRMATION_MESSAGES.rateLimited);
  }
  const { headers: responseHeaders, response } =
    await auth.api.generatePasskeyAuthenticationOptions({
      headers: session.requestHeaders,
      returnHeaders: true,
    });
  const jar = await cookies();
  for (const cookie of cookiesToSet(responseHeaders)) {
    jar.set(cookie.name, cookie.value, cookie.options);
  }
  const options = response as Record<string, unknown>;
  const allowed = options.allowCredentials;
  // Without passkeys of its own the plugin would allow any, as for sign-in.
  if (!(Array.isArray(allowed) && allowed.length > 0)) {
    return fail(CONFIRMATION_MESSAGES.passkeyFailed);
  }
  return { ok: true, options: { ...options, userVerification: "required" } };
}

// The plugin's answers for an assertion that doesn't check out.
const PASSKEY_REFUSALS = new Set([
  "CHALLENGE_NOT_FOUND",
  "PASSKEY_NOT_FOUND",
  "AUTHENTICATION_FAILED",
  "PASSKEY_USER_VERIFICATION_REQUIRED",
]);

/**
 * Checks a passkey assertion from this person's own passkey, through the
 * passkey plugin: the signature, the challenge (once), the origin, user
 * verification (packages/auth/passkey.ts refuses without it) and the
 * counter. The plugin then signs in as the passkey's owner; that session
 * is deleted straight away and its token never leaves the server.
 */
export async function verifyOwnPasskey(
  session: Pick<ConfirmableSession, "userId" | "requestHeaders">,
  response: Record<string, unknown>,
): Promise<ConfirmResult> {
  let created: { session?: { token?: string }; user?: { id?: string } } | null =
    null;
  try {
    created = await auth.api.verifyPasskeyAuthentication({
      headers: session.requestHeaders,
      body: { response },
    });
  } catch (error) {
    const code = authErrorCode(error);
    if (code === "PASSKEY_USER_VERIFICATION_REQUIRED") {
      return fail(PASSKEY_MESSAGES.noUserVerification);
    }
    if (code && PASSKEY_REFUSALS.has(code)) {
      return fail(CONFIRMATION_MESSAGES.passkeyFailed);
    }
    throw error;
  } finally {
    const token = created?.session?.token;
    if (token) {
      try {
        await db.delete(sessionTable).where(eq(sessionTable.token, token));
      } catch (error) {
        logError(error as Error, { action: "account.verifyOwnPasskey" });
      }
    }
  }
  return created?.user?.id === session.userId
    ? { ok: true }
    : fail(CONFIRMATION_MESSAGES.passkeyFailed);
}

export async function startPasskeyConfirmation(): Promise<
  { ok: true; options: Record<string, unknown> } | ConfirmResult
> {
  try {
    const session = await currentSession();
    if (!session) return fail(CONFIRMATION_MESSAGES.signedOut);
    const facts = await loadTwoFactorFacts(session.userId);
    // Any passkey of the person's own confirms, two-step verification on or
    // off: it checks the person on their device, which a stolen session
    // cookie can't.
    if (facts.passkeys === 0) {
      return fail(CONFIRMATION_MESSAGES.passkeyUnavailable);
    }
    return await passkeyAssertionOptions(session);
  } catch (error) {
    logError(error as Error, { action: "account.startPasskeyConfirmation" });
    return fail(CONFIRMATION_MESSAGES.failed);
  }
}

const assertionInput = z.object({
  response: z.record(z.string(), z.unknown()),
});

export async function confirmWithPasskey(
  input: unknown,
): Promise<ConfirmResult> {
  const parsed = assertionInput.safeParse(input);
  if (!parsed.success) return fail(CONFIRMATION_MESSAGES.passkeyFailed);
  try {
    const session = await currentSession();
    if (!session) return fail(CONFIRMATION_MESSAGES.signedOut);
    const facts = await loadTwoFactorFacts(session.userId);
    if (facts.passkeys === 0) {
      return fail(CONFIRMATION_MESSAGES.passkeyUnavailable);
    }
    if (!(await answerLimiter.limit(session.userId)).success) {
      return fail(CONFIRMATION_MESSAGES.rateLimited);
    }
    // With two-step verification on, a passkey shares the account's lockout
    // with codes. Without it there's no `two_factor` row to count on, and
    // none is needed: an assertion is a signature from the person's own
    // device over a single-use challenge, so it can't be guessed.
    const attempt = facts.on ? await reserveCodeAttempt(session.userId) : null;
    if (attempt && !attempt.ok) {
      return fail(
        attempt.reason === "locked"
          ? TWO_FACTOR_MESSAGES.locked
          : CONFIRMATION_MESSAGES.failed,
      );
    }
    const check = await verifyOwnPasskey(session, parsed.data.response);
    if (!check.ok) {
      return attempt?.ok && attempt.attempts >= LOCKOUT_FAILURES
        ? fail(TWO_FACTOR_MESSAGES.locked)
        : check;
    }
    if (attempt?.ok) await clearCodeFailures(attempt.id);
    await recordConfirmation(session, { strong: true });
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.confirmWithPasskey" });
    return fail(CONFIRMATION_MESSAGES.passkeyFailed);
  }
}

// ─── Emailed codes (accounts without two-step verification) ─────────────────

interface StoredCode {
  userId: string;
  attempts: number;
  hash: string;
}

function codeKey(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required for confirmation codes");
  }
  return "qrdx-dev-confirmation-codes";
}

/** HMAC of the code, bound to the session it was sent for. */
export function confirmationCodeHash(
  key: string,
  sessionId: string,
  code: string,
): string {
  return createHmac("sha256", key)
    .update(`${sessionId}:${code}`)
    .digest("base64url");
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseStoredCode(value: string): StoredCode | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredCode>;
    if (
      typeof parsed.userId === "string" &&
      typeof parsed.attempts === "number" &&
      typeof parsed.hash === "string"
    ) {
      return parsed as StoredCode;
    }
  } catch {
    // Not one of ours: treated as expired.
  }
  return null;
}

async function storeCode(
  sessionId: string,
  code: StoredCode,
  expiresAt: Date,
): Promise<void> {
  const identifier = codeIdentifier(sessionId);
  const now = new Date();
  await db.batch([
    db.delete(verification).where(eq(verification.identifier, identifier)),
    db.insert(verification).values({
      id: randomUUID(),
      identifier,
      value: JSON.stringify(code),
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }),
  ]);
}

/** Emails a new code to the account's address; the last one stops working. */
export async function sendConfirmationCode(): Promise<ConfirmResult> {
  try {
    const session = await currentSession();
    if (!session) return fail(CONFIRMATION_MESSAGES.signedOut);
    const { on } = await loadTwoFactorFacts(session.userId);
    if (on) return fail(CONFIRMATION_MESSAGES.twoFactorOn);
    if (!signInCodesAvailable()) return fail(CONFIRMATION_MESSAGES.signInAgain);
    if (!(await sendLimiter.limit(session.userId)).success) {
      return fail(CONFIRMATION_MESSAGES.rateLimited);
    }
    const allowed = await addressMayRequestCode(addressKey(session.email), [
      perAddressLimiter,
      perAddressDailyLimiter,
    ]);
    if (!allowed) return fail(CONFIRMATION_MESSAGES.rateLimited);

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await storeCode(
      session.sessionId,
      {
        userId: session.userId,
        attempts: 0,
        hash: confirmationCodeHash(codeKey(), session.sessionId, code),
      },
      new Date(Date.now() + CONFIRMATION_CODE_MINUTES * 60_000),
    );
    const details = await currentRequestDetails();
    try {
      await deliverSignInCode(
        { email: session.email, otp: code },
        {
          nodeEnv: process.env.NODE_ENV,
          deliveryAllowed: isOutboundDeliveryAllowed(),
          log: (line) => console.info(line),
          send: () =>
            sendEmail({
              to: session.email,
              subject: CONFIRMATION_CODE_SUBJECT,
              react: (
                <ConfirmationCodeEmail
                  code={code}
                  details={details}
                  expiresInMinutes={CONFIRMATION_CODE_MINUTES}
                />
              ),
              tags: [{ name: "category", value: "confirmation_code" }],
            }),
        },
        "confirmation code",
      );
    } catch (error) {
      // Undelivered: the stored code can't be used by anyone.
      await db
        .delete(verification)
        .where(eq(verification.identifier, codeIdentifier(session.sessionId)));
      logError(error as Error, { action: "account.sendConfirmationCode" });
      return fail(CONFIRMATION_MESSAGES.codeNotSent);
    }
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.sendConfirmationCode" });
    return fail(CONFIRMATION_MESSAGES.codeNotSent);
  }
}

export type EmailCodeResult =
  | { ok: true }
  | { ok: false; error: string /** Send a new code */; codeDead?: boolean };

/**
 * Checks the emailed code. The stored code is taken out first (so parallel
 * guesses can't share tries) and put back with one more try counted when
 * it's wrong and tries are left.
 */
export async function confirmWithEmailCode(
  input: unknown,
): Promise<EmailCodeResult> {
  const parsed = z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/),
    })
    .safeParse(input);
  if (!parsed.success) return fail(CONFIRMATION_MESSAGES.invalidCode);
  try {
    const session = await currentSession();
    if (!session) return fail(CONFIRMATION_MESSAGES.signedOut);
    const { on } = await loadTwoFactorFacts(session.userId);
    if (on) return fail(CONFIRMATION_MESSAGES.twoFactorOn);
    if (!(await answerLimiter.limit(session.userId)).success) {
      return fail(CONFIRMATION_MESSAGES.rateLimited);
    }
    const [row] = await db
      .delete(verification)
      .where(eq(verification.identifier, codeIdentifier(session.sessionId)))
      .returning({
        value: verification.value,
        expiresAt: verification.expiresAt,
      });
    const stored = row ? parseStoredCode(row.value) : null;
    if (
      !(row && stored) ||
      stored.userId !== session.userId ||
      new Date(row.expiresAt).getTime() <= Date.now()
    ) {
      return {
        ok: false,
        error: CONFIRMATION_MESSAGES.codeExpired,
        codeDead: true,
      };
    }
    const hash = confirmationCodeHash(
      codeKey(),
      session.sessionId,
      parsed.data.code,
    );
    if (sameHash(hash, stored.hash)) {
      await recordConfirmation(session);
      return { ok: true };
    }
    const attempts = stored.attempts + 1;
    if (attempts >= CONFIRMATION_CODE_ATTEMPTS) {
      return {
        ok: false,
        error: CONFIRMATION_MESSAGES.tooManyCodeAttempts,
        codeDead: true,
      };
    }
    await storeCode(session.sessionId, { ...stored, attempts }, row.expiresAt);
    return fail(CONFIRMATION_MESSAGES.wrongCode);
  } catch (error) {
    logError(error as Error, { action: "account.confirmWithEmailCode" });
    return fail(CONFIRMATION_MESSAGES.failed);
  }
}
