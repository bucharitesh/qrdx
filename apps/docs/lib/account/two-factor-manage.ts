import "server-only";

import { forwardAuthCookies } from "@repo/auth/forward-cookies";
import { auth } from "@repo/auth/server";
import {
  LOCKOUT_FAILURES,
  LOCKOUT_MINUTES,
} from "@repo/auth/sign-in-challenge-rules";
import { database as db, twoFactor } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import {
  isTotpCode,
  normalizeBackupCode,
  secretFromUri,
  TWO_FACTOR_MESSAGES,
} from "@/lib/auth/two-factor";
import { logError } from "@/lib/shared";
import { canChangeEmailNow } from "./email-change";
import { sendTwoFactorNotice } from "./two-factor-notice-server";
import { forgetTrustedDevices, twoFactorEnabledFor } from "./two-factor-server";

export { twoFactorEnabledFor };

// Settings → Profile & security → Two-step verification. Better Auth's
// enable, disable and backup-code endpoints are off over HTTP
// (packages/auth/server.ts), so this is the only way in. Turning it on needs
// a recent sign-in (the email-change rule); turning it off and new backup
// codes need a current authenticator or backup code. Each change emails a
// notice to the account's address.
//
// Starting setup and new backup codes are server actions
// (app/settings/account/_lib/two-factor-actions.ts). Confirming setup and
// turning it off swap the session for a new one (Better Auth deletes the old
// one), so they run in a route handler (app/api/account/two-factor/route.ts):
// a server action that sets a cookie re-renders the page in the same
// response with the request's old cookie, which now has no session, and the
// page redirected to /sign-in mid-setup, losing the backup codes.

export type TwoFactorResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | {
      ok: false;
      error: string;
      /** "reauth": sign in again first. "restart": start setup again. */
      reason?: "reauth" | "restart";
    };

const MESSAGES = {
  ...TWO_FACTOR_MESSAGES,
  reauth:
    "For your security, sign out and sign in again, then turn on two-step verification within a day.",
  signedOut: "Sign in to change two-step verification.",
  alreadyOn: "Two-step verification is already on.",
  notOn: "Two-step verification is off.",
  restart: "This setup expired. Start again.",
  invalidCurrentCode:
    "Enter a 6-digit code from your authenticator app, or a backup code.",
  wrongCurrentCode: "That code isn't right. Try a new code from your app.",
  rateLimitedLong: "Too many tries. Wait a few minutes and try again.",
} as const;

// Per user, on top of the account lockout below (auth.api calls skip Better
// Auth's own HTTP rate limiter). Without Redis these allow everything; the
// lockout still applies.
const setupLimiter = createRateLimiter({
  prefix: "qrdx:two-factor-setup",
  limiter: slidingWindow(10, "15 m"),
});
const codeLimiter = createRateLimiter({
  prefix: "qrdx:two-factor-code",
  limiter: slidingWindow(10, "15 m"),
});

const fail = (
  error: string,
  reason?: "reauth" | "restart",
): { ok: false; error: string; reason?: "reauth" | "restart" } =>
  reason ? { ok: false, error, reason } : { ok: false, error };

/** What a Better Auth APIError carries (auth.api throws these). */
const authErrorCode = (error: unknown): string | undefined =>
  (error as { body?: { code?: string } } | null)?.body?.code;

interface Signed {
  userId: string;
  email: string;
  twoFactorEnabled: boolean;
  sessionCreatedAt: Date;
  requestHeaders: Headers;
}

async function signedIn(): Promise<Signed | null> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    twoFactorEnabled: await twoFactorEnabledFor(session.user.id),
    sessionCreatedAt: new Date(session.session.createdAt),
    requestHeaders,
  };
}

const notify = (
  kind: Parameters<typeof sendTwoFactorNotice>[0],
  email: string,
) => after(() => sendTwoFactorNotice(kind, email));

// ─── Turning it on ───────────────────────────────────────────────────────────

/**
 * Step 1: a new secret for the authenticator app. Nothing changes for sign-in
 * until a code from it is confirmed (step 2); starting again replaces it.
 */
export async function startTwoFactorSetup(): Promise<
  TwoFactorResult<{ totpUri: string; secret: string }>
> {
  try {
    const user = await signedIn();
    if (!user) return fail(MESSAGES.signedOut);
    if (user.twoFactorEnabled) return fail(MESSAGES.alreadyOn);
    if (!canChangeEmailNow(user.sessionCreatedAt, new Date())) {
      return fail(MESSAGES.reauth, "reauth");
    }
    if (!(await setupLimiter.limit(user.userId)).success) {
      return fail(MESSAGES.rateLimitedLong);
    }
    const { totpURI } = await auth.api.enableTwoFactor({
      headers: user.requestHeaders,
      body: {},
    });
    const secret = secretFromUri(totpURI);
    if (!secret) throw new Error("The authenticator URI has no secret");
    return { ok: true, totpUri: totpURI, secret };
  } catch (error) {
    if (authErrorCode(error) === "TOTP_ALREADY_ENABLED") {
      return fail(MESSAGES.alreadyOn);
    }
    logError(error as Error, { action: "account.startTwoFactorSetup" });
    return fail(MESSAGES.failed);
  }
}

/**
 * Step 2: the first code from the app turns it on. Returns the backup codes,
 * shown once. Better Auth swaps the session for a new one here; its cookie is
 * passed on to the browser.
 */
export async function confirmTwoFactorSetup(
  input: unknown,
): Promise<TwoFactorResult<{ backupCodes: string[] }>> {
  const parsed = z.object({ code: z.string().trim() }).safeParse(input);
  if (!(parsed.success && isTotpCode(parsed.data.code))) {
    return fail(MESSAGES.invalidCode);
  }
  let user: Signed;
  try {
    const signed = await signedIn();
    if (!signed) return fail(MESSAGES.signedOut);
    user = signed;
    if (user.twoFactorEnabled) return fail(MESSAGES.alreadyOn);
    if (!canChangeEmailNow(user.sessionCreatedAt, new Date())) {
      return fail(MESSAGES.reauth, "reauth");
    }
    if (!(await setupLimiter.limit(user.userId)).success) {
      return fail(MESSAGES.rateLimitedLong);
    }
    const confirmed = await auth.api.verifyTOTP({
      headers: user.requestHeaders,
      body: { code: parsed.data.code },
      returnHeaders: true,
    });
    await forwardAuthCookies(confirmed.headers);
  } catch (error) {
    switch (authErrorCode(error)) {
      case "INVALID_CODE":
        return fail(MESSAGES.wrongCode);
      case "TOTP_NOT_ENABLED":
        return fail(MESSAGES.restart, "restart");
    }
    logError(error as Error, { action: "account.confirmTwoFactorSetup" });
    return fail(MESSAGES.failed);
  }

  notify("on", user.email);
  try {
    const { backupCodes } = await auth.api.viewBackupCodes({
      body: { userId: user.userId },
    });
    return { ok: true, backupCodes };
  } catch (error) {
    // On, but the codes couldn't be read back: new ones can be made from
    // the on state.
    logError(error as Error, { action: "account.confirmTwoFactorSetup.codes" });
    return { ok: true, backupCodes: [] };
  }
}

// ─── A current code, for turning off, new backup codes and deleting ──────────

/**
 * Checks a current authenticator or backup code (a backup code is used up),
 * counting failures toward the same lockout as sign-in: 10 wrong in a row
 * lock the account's codes for 15 minutes. Turning it off, new backup codes
 * and deleting the account (actions/account.ts) all use this one check.
 */
export async function checkCurrentCode(
  user: Pick<Signed, "userId" | "requestHeaders">,
  rawCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const totpCode = isTotpCode(rawCode.trim()) ? rawCode.trim() : null;
  const backupCode = totpCode ? null : normalizeBackupCode(rawCode);
  if (!(totpCode || backupCode)) {
    return { ok: false, error: MESSAGES.invalidCurrentCode };
  }

  const [row] = await db
    .select({ id: twoFactor.id, lockedUntil: twoFactor.lockedUntil })
    .from(twoFactor)
    .where(eq(twoFactor.userId, user.userId))
    .limit(1);
  if (!row) return { ok: false, error: MESSAGES.notOn };
  if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: MESSAGES.locked };
  }
  if (!(await codeLimiter.limit(user.userId)).success) {
    return { ok: false, error: MESSAGES.rateLimitedLong };
  }

  try {
    if (totpCode) {
      await auth.api.verifyTOTP({
        headers: user.requestHeaders,
        body: { code: totpCode },
      });
    } else {
      await auth.api.verifyBackupCode({
        headers: user.requestHeaders,
        body: { code: backupCode as string, disableSession: true },
      });
    }
  } catch (error) {
    const code = authErrorCode(error);
    if (code !== "INVALID_CODE" && code !== "INVALID_BACKUP_CODE") throw error;
    const [counted] = await db
      .update(twoFactor)
      .set({
        failedVerificationCount: sql`coalesce(${twoFactor.failedVerificationCount}, 0) + 1`,
      })
      .where(eq(twoFactor.id, row.id))
      .returning({ failures: twoFactor.failedVerificationCount });
    if ((counted?.failures ?? 0) >= LOCKOUT_FAILURES) {
      await db
        .update(twoFactor)
        .set({
          lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000),
        })
        .where(eq(twoFactor.id, row.id));
      return { ok: false, error: MESSAGES.locked };
    }
    return {
      ok: false,
      error: totpCode ? MESSAGES.wrongCurrentCode : MESSAGES.wrongBackupCode,
    };
  }
  await db
    .update(twoFactor)
    .set({ failedVerificationCount: 0, lockedUntil: null })
    .where(eq(twoFactor.id, row.id));
  return { ok: true };
}

const codeInput = z.object({ code: z.string().max(64) });

/** New backup codes; the old ones stop working. Returns them, shown once. */
export async function regenerateBackupCodes(
  input: unknown,
): Promise<TwoFactorResult<{ backupCodes: string[] }>> {
  const parsed = codeInput.safeParse(input);
  if (!parsed.success) return fail(MESSAGES.invalidCurrentCode);
  try {
    const user = await signedIn();
    if (!user) return fail(MESSAGES.signedOut);
    if (!user.twoFactorEnabled) return fail(MESSAGES.notOn);
    const check = await checkCurrentCode(user, parsed.data.code);
    if (!check.ok) return fail(check.error);
    const { backupCodes } = await auth.api.generateBackupCodes({
      headers: user.requestHeaders,
      body: {},
    });
    notify("backup-codes", user.email);
    revalidatePath("/settings/account");
    return { ok: true, backupCodes };
  } catch (error) {
    logError(error as Error, { action: "account.regenerateBackupCodes" });
    return fail(MESSAGES.failed);
  }
}

/**
 * Turns it off: the secret and backup codes are deleted and every device's
 * "don't ask again" is forgotten. Better Auth swaps the session for a new
 * one; its cookie is passed on to the browser.
 */
export async function turnOffTwoFactor(
  input: unknown,
): Promise<TwoFactorResult> {
  const parsed = codeInput.safeParse(input);
  if (!parsed.success) return fail(MESSAGES.invalidCurrentCode);
  try {
    const user = await signedIn();
    if (!user) return fail(MESSAGES.signedOut);
    if (!user.twoFactorEnabled) return fail(MESSAGES.notOn);
    const check = await checkCurrentCode(user, parsed.data.code);
    if (!check.ok) return fail(check.error);
    const disabled = await auth.api.disableTwoFactor({
      headers: user.requestHeaders,
      body: {},
      returnHeaders: true,
    });
    await forwardAuthCookies(disabled.headers);
    await forgetTrustedDevices(user.userId);
    notify("off", user.email);
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.turnOffTwoFactor" });
    return fail(MESSAGES.failed);
  }
}
