import "server-only";

import { forwardAuthCookies } from "@repo/auth/forward-cookies";
import { auth } from "@repo/auth/server";
import { database as db, twoFactor, user as userTable } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import {
  isTotpCode,
  secretFromUri,
  TWO_FACTOR_MESSAGES,
} from "@/lib/auth/two-factor";
import { logError } from "@/lib/shared";
import {
  type ConfirmableSession,
  carryConfirmation,
  confirmedSession,
  passkeyAssertionOptions,
  verifyOwnPasskey,
} from "./confirmation-server";
import {
  authenticatorSetupStarted,
  hasAuthenticatorApp,
  NO_AUTHENTICATOR_SECRET,
} from "./two-factor-methods";
import { sendTwoFactorNotice } from "./two-factor-notice-server";
import {
  loadTwoFactorFacts,
  resetTwoFactor,
  twoFactorEnabledFor,
} from "./two-factor-server";

export { twoFactorEnabledFor };

// Settings → Profile & security → Two-step verification. Better Auth's
// enable, disable and backup-code endpoints are off over HTTP
// (packages/auth/server.ts), so this is the only way in. Every change needs
// a recent "Confirm it's you" (./confirmation-server.ts) and emails a notice
// to the account's address. The methods model is ./two-factor-methods.ts:
// a passkey or an authenticator app turns it on, both can be set up, and
// removing the last one turns it off.
//
// Confirming an authenticator app as the FIRST method swaps the session for a
// new one (Better Auth deletes the old one), so it runs in a route handler
// (app/api/account/two-factor/route.ts): a server action that sets a cookie
// re-renders the page in the same response with the request's old cookie,
// which then has no session, and the page redirected to /sign-in mid-setup,
// losing the backup codes. Everything else keeps the session and is a server
// action (app/settings/account/_lib/two-factor-actions.ts).

export type TwoFactorResult<T = Record<never, never>> =
  | ({ ok: true } & T)
  | {
      ok: false;
      error: string;
      /** "restart": start the authenticator setup again. */
      reason?: "restart";
    };

const MESSAGES = {
  ...TWO_FACTOR_MESSAGES,
  signedOut: "Sign in to change two-step verification.",
  alreadyOn: "Two-step verification is already on.",
  notOn: "Two-step verification is off.",
  appAlreadySetUp: "An authenticator app is already set up.",
  noApp: "There's no authenticator app to remove.",
  noPasskey: "Add a passkey first.",
  restart: "This setup expired. Start again.",
  rateLimitedLong: "Too many tries. Wait a few minutes and try again.",
} as const;

// Per user (auth.api calls skip Better Auth's own HTTP rate limiter). Without
// Redis these allow everything; the confirmation still applies.
const setupLimiter = createRateLimiter({
  prefix: "qrdx:two-factor-setup",
  limiter: slidingWindow(10, "15 m"),
});
const changeLimiter = createRateLimiter({
  prefix: "qrdx:two-factor-change",
  limiter: slidingWindow(20, "15 m"),
});

const fail = (
  error: string,
  reason?: "restart",
): { ok: false; error: string; reason?: "restart" } =>
  reason ? { ok: false, error, reason } : { ok: false, error };

/** What a Better Auth APIError carries (auth.api throws these). */
const authErrorCode = (error: unknown): string | undefined =>
  (error as { body?: { code?: string } } | null)?.body?.code;

type NoticeKind = Parameters<typeof sendTwoFactorNotice>[0];

const notify = (kind: NoticeKind, email: string) =>
  after(() => sendTwoFactorNotice(kind, email));

/** Signed in and confirmed in the last 10 minutes, else the failure. */
const confirmed = () => confirmedSession(MESSAGES.signedOut);

const refresh = () => revalidatePath("/settings/account");

// ─── Turning it on with a passkey ────────────────────────────────────────────

/**
 * Two-step verification on, with passkeys as the method: a `two_factor` row
 * for the backup codes and the attempts counter, with no authenticator
 * secret (two-factor-methods.ts), then the switch. Returns the backup codes,
 * shown once, or null when it was already on by now (an authenticator app
 * confirmed in another tab meanwhile: its row is left alone). The session
 * stays as it is. Call only when the account has a passkey.
 */
export async function turnOnWithPasskeys(
  session: Pick<ConfirmableSession, "userId" | "email" | "requestHeaders">,
): Promise<string[] | null> {
  // Read again right before replacing the row: the caller's check may be
  // stale, and a confirmed authenticator app must never be wiped.
  const [current] = await db
    .select({ on: userTable.twoFactorEnabled })
    .from(userTable)
    .where(eq(userTable.id, session.userId))
    .limit(1);
  if (current?.on) return null;
  // An authenticator setup that was started and never confirmed is replaced.
  await db.delete(twoFactor).where(eq(twoFactor.userId, session.userId));
  // The plugin makes the row and the codes (encrypted as it reads them).
  const { backupCodes } = (await auth.api.enableTwoFactor({
    headers: session.requestHeaders,
    body: {},
  })) as { backupCodes: string[] };
  await db.batch([
    db
      .update(twoFactor)
      .set({ secret: NO_AUTHENTICATOR_SECRET, verified: false })
      .where(eq(twoFactor.userId, session.userId)),
    db
      .update(userTable)
      .set({ twoFactorEnabled: true, updatedAt: new Date() })
      .where(eq(userTable.id, session.userId)),
  ]);
  notify("on", session.email);
  return backupCodes;
}

/**
 * The legacy "Your passkey is ready to be your second step": options for the
 * browser's prompt with one of the account's existing passkeys.
 */
export async function existingPasskeyOptions(): Promise<
  TwoFactorResult<{ options: Record<string, unknown> }>
> {
  try {
    const allowed = await confirmed();
    if (!allowed.ok) return allowed;
    const facts = await loadTwoFactorFacts(allowed.session.userId);
    if (facts.on) return fail(MESSAGES.alreadyOn);
    if (facts.passkeys === 0) return fail(MESSAGES.noPasskey);
    const result = await passkeyAssertionOptions(allowed.session);
    return result.ok && "options" in result
      ? { ok: true, options: result.options }
      : fail(result.ok ? MESSAGES.failed : result.error);
  } catch (error) {
    logError(error as Error, { action: "account.existingPasskeyOptions" });
    return fail(MESSAGES.failed);
  }
}

/** Then: the passkey answered, so it's on. Returns the backup codes. */
export async function turnOnWithExistingPasskey(
  input: unknown,
): Promise<TwoFactorResult<{ backupCodes: string[] }>> {
  const parsed = z
    .object({ response: z.record(z.string(), z.unknown()) })
    .safeParse(input);
  if (!parsed.success) return fail(MESSAGES.failed);
  try {
    const allowed = await confirmed();
    if (!allowed.ok) return allowed;
    const { session } = allowed;
    const facts = await loadTwoFactorFacts(session.userId);
    if (facts.on) return fail(MESSAGES.alreadyOn);
    if (facts.passkeys === 0) return fail(MESSAGES.noPasskey);
    if (!(await setupLimiter.limit(session.userId)).success) {
      return fail(MESSAGES.rateLimitedLong);
    }
    const check = await verifyOwnPasskey(session, parsed.data.response);
    if (!check.ok) return check;
    const backupCodes = await turnOnWithPasskeys(session);
    // Turned on in another tab meanwhile: nothing more to do here.
    if (backupCodes === null) return fail(MESSAGES.alreadyOn);
    refresh();
    return { ok: true, backupCodes };
  } catch (error) {
    logError(error as Error, { action: "account.turnOnWithExistingPasskey" });
    return fail(MESSAGES.failed);
  }
}

// ─── The authenticator app ───────────────────────────────────────────────────

/**
 * Step 1: a new secret for the authenticator app. Nothing changes for sign-in
 * until a code from it is confirmed (step 2); starting again replaces it.
 * With two-step verification already on (passkeys), the backup codes the
 * person has keep working: the plugin makes new ones with the secret, and
 * the old ones are put back.
 */
export async function startAuthenticatorSetup(): Promise<
  TwoFactorResult<{ totpUri: string; secret: string }>
> {
  try {
    const allowed = await confirmed();
    if (!allowed.ok) return allowed;
    const { session } = allowed;
    if (!(await setupLimiter.limit(session.userId)).success) {
      return fail(MESSAGES.rateLimitedLong);
    }
    const facts = await loadTwoFactorFacts(session.userId);
    if (hasAuthenticatorApp(facts.row)) {
      return fail(facts.on ? MESSAGES.appAlreadySetUp : MESSAGES.failed);
    }
    const keptCodes =
      facts.on && facts.row
        ? (
            await db
              .select({ backupCodes: twoFactor.backupCodes })
              .from(twoFactor)
              .where(eq(twoFactor.id, facts.row.id))
              .limit(1)
          )[0]?.backupCodes
        : undefined;

    const { totpURI } = (await auth.api.enableTwoFactor({
      headers: session.requestHeaders,
      body: {},
    })) as { totpURI: string };

    if (keptCodes) {
      const [made] = await db
        .select({ backupCodes: twoFactor.backupCodes })
        .from(twoFactor)
        .where(eq(twoFactor.userId, session.userId))
        .limit(1);
      if (made) {
        await db
          .update(twoFactor)
          .set({ backupCodes: keptCodes })
          .where(
            and(
              eq(twoFactor.userId, session.userId),
              eq(twoFactor.backupCodes, made.backupCodes),
            ),
          );
      }
    }
    const secret = secretFromUri(totpURI);
    if (!secret) throw new Error("The authenticator URI has no secret");
    return { ok: true, totpUri: totpURI, secret };
  } catch (error) {
    if (authErrorCode(error) === "TOTP_ALREADY_ENABLED") {
      return fail(MESSAGES.appAlreadySetUp);
    }
    logError(error as Error, { action: "account.startAuthenticatorSetup" });
    return fail(MESSAGES.failed);
  }
}

/**
 * Step 2: the first code from the app confirms it. As the first method it
 * turns two-step verification on and returns the backup codes (shown once);
 * Better Auth swaps the session for a new one, whose cookie is passed on,
 * and the confirmation moves to it. As a second method nothing else changes
 * and no codes are returned.
 */
export async function confirmAuthenticatorSetup(
  input: unknown,
): Promise<TwoFactorResult<{ backupCodes: string[] | null }>> {
  const parsed = z.object({ code: z.string().trim() }).safeParse(input);
  if (!(parsed.success && isTotpCode(parsed.data.code))) {
    return fail(MESSAGES.invalidCode);
  }
  let session: ConfirmableSession;
  let wasOn: boolean;
  try {
    const allowed = await confirmed();
    if (!allowed.ok) return allowed;
    session = allowed.session;
    if (!(await setupLimiter.limit(session.userId)).success) {
      return fail(MESSAGES.rateLimitedLong);
    }
    const facts = await loadTwoFactorFacts(session.userId);
    if (hasAuthenticatorApp(facts.row)) {
      return fail(facts.on ? MESSAGES.appAlreadySetUp : MESSAGES.alreadyOn);
    }
    // Only a setup started in step 1 can be confirmed.
    if (!authenticatorSetupStarted(facts.row)) {
      return fail(MESSAGES.restart, "restart");
    }
    wasOn = facts.on;
    const confirmedApp = await auth.api.verifyTOTP({
      headers: session.requestHeaders,
      body: { code: parsed.data.code },
      returnHeaders: true,
    });
    const setCookie = confirmedApp.headers?.get("set-cookie") ?? null;
    await forwardAuthCookies(confirmedApp.headers);
    if (!wasOn) await carryConfirmation(session, setCookie);
  } catch (error) {
    switch (authErrorCode(error)) {
      case "INVALID_CODE":
        return fail(MESSAGES.wrongCode);
      case "TOTP_NOT_ENABLED":
        return fail(MESSAGES.restart, "restart");
    }
    logError(error as Error, { action: "account.confirmAuthenticatorSetup" });
    return fail(MESSAGES.failed);
  }

  if (wasOn) {
    notify("app-added", session.email);
    return { ok: true, backupCodes: null };
  }
  notify("on", session.email);
  try {
    const { backupCodes } = await auth.api.viewBackupCodes({
      body: { userId: session.userId },
    });
    return { ok: true, backupCodes };
  } catch (error) {
    // On, but the codes couldn't be read back: new ones can be made from
    // the on state.
    logError(error as Error, {
      action: "account.confirmAuthenticatorSetup.codes",
    });
    return { ok: true, backupCodes: [] };
  }
}

/**
 * After a method is removed: when two-step verification is on but neither a
 * passkey nor the authenticator app is left (two removals at once, from two
 * tabs), it's turned off cleanly instead of being left on with backup codes
 * only. True when it turned it off.
 */
export async function turnOffIfNoMethodLeft(userId: string): Promise<boolean> {
  const facts = await loadTwoFactorFacts(userId);
  if (!facts.on || facts.passkeys > 0 || hasAuthenticatorApp(facts.row)) {
    return false;
  }
  await resetTwoFactor(userId);
  return true;
}

/**
 * Removes the authenticator app. With a passkey left, two-step verification
 * stays on (the secret is blanked; the backup codes keep working); as the
 * last method, it turns off.
 */
export async function removeAuthenticatorApp(): Promise<
  TwoFactorResult<{ turnedOff: boolean }>
> {
  try {
    const allowed = await confirmed();
    if (!allowed.ok) return allowed;
    const { session } = allowed;
    if (!(await changeLimiter.limit(session.userId)).success) {
      return fail(MESSAGES.rateLimitedLong);
    }
    const facts = await loadTwoFactorFacts(session.userId);
    if (!(facts.on && hasAuthenticatorApp(facts.row))) {
      return fail(MESSAGES.noApp);
    }
    if (facts.passkeys > 0) {
      await db
        .update(twoFactor)
        .set({ secret: NO_AUTHENTICATOR_SECRET, verified: false })
        .where(eq(twoFactor.userId, session.userId));
      // The last passkey may have been removed meanwhile (another tab).
      if (await turnOffIfNoMethodLeft(session.userId)) {
        notify("off", session.email);
        refresh();
        return { ok: true, turnedOff: true };
      }
      notify("app-removed", session.email);
      refresh();
      return { ok: true, turnedOff: false };
    }
    await resetTwoFactor(session.userId);
    notify("off", session.email);
    refresh();
    return { ok: true, turnedOff: true };
  } catch (error) {
    logError(error as Error, { action: "account.removeAuthenticatorApp" });
    return fail(MESSAGES.failed);
  }
}

// ─── Backup codes and turning it off ─────────────────────────────────────────

/** New backup codes; the old ones stop working. Returns them, shown once. */
export async function regenerateBackupCodes(): Promise<
  TwoFactorResult<{ backupCodes: string[] }>
> {
  try {
    const allowed = await confirmed();
    if (!allowed.ok) return allowed;
    const { session } = allowed;
    if (!(await twoFactorEnabledFor(session.userId)))
      return fail(MESSAGES.notOn);
    if (!(await changeLimiter.limit(session.userId)).success) {
      return fail(MESSAGES.rateLimitedLong);
    }
    const { backupCodes } = await auth.api.generateBackupCodes({
      headers: session.requestHeaders,
      body: {},
    });
    notify("backup-codes", session.email);
    refresh();
    return { ok: true, backupCodes };
  } catch (error) {
    logError(error as Error, { action: "account.regenerateBackupCodes" });
    return fail(MESSAGES.failed);
  }
}

/**
 * Turns it off: the authenticator secret and backup codes are deleted and
 * every device's "don't ask again" is forgotten (resetTwoFactor). Passkeys
 * stay, as a way to sign in. The session stays as it is.
 */
export async function turnOffTwoFactor(): Promise<TwoFactorResult> {
  try {
    const allowed = await confirmed();
    if (!allowed.ok) return allowed;
    const { session } = allowed;
    if (!(await twoFactorEnabledFor(session.userId)))
      return fail(MESSAGES.notOn);
    if (!(await changeLimiter.limit(session.userId)).success) {
      return fail(MESSAGES.rateLimitedLong);
    }
    await resetTwoFactor(session.userId);
    notify("off", session.email);
    refresh();
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.turnOffTwoFactor" });
    return fail(MESSAGES.failed);
  }
}
