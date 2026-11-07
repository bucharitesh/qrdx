"use server";

import { cookiesToSet } from "@repo/auth/passkey";
import { auth } from "@repo/auth/server";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import {
  type ConfirmableSession,
  confirmedSession,
} from "@/lib/account/confirmation-server";
import {
  defaultPasskeyName,
  normalizePasskeyName,
  PASSKEY_MESSAGES,
  registrationFailure,
} from "@/lib/account/passkeys";
import { sendPasskeyNotice } from "@/lib/account/passkeys-server";
import {
  turnOffIfNoMethodLeft,
  turnOnWithPasskeys,
} from "@/lib/account/two-factor-manage";
import { sendTwoFactorNotice } from "@/lib/account/two-factor-notice-server";
import { loadTwoFactorFacts } from "@/lib/account/two-factor-server";
import { logError } from "@/lib/shared";

// Settings → Profile & security → Two-step verification → Passkeys. Better
// Auth's endpoints for adding, renaming and removing passkeys are off over
// HTTP (packages/auth/passkey.ts), so these actions are the only way in.
// Each needs a recent "Confirm it's you" (lib/account/confirmation-server.ts)
// and answers CONFIRMATION_REQUIRED without one. Adding the first passkey
// turns two-step verification on (and returns the backup codes); removing
// the last method turns it off. Every change is limited per user, and adding
// or removing one emails the account's address.
//
// The passkey plugin's own "fresh session" rule (a sign-in within a day) is
// off for adding passkeys (packages/auth/passkey.ts): confirming it's you
// covers it. SESSION_NOT_FRESH is still handled, should it ever come back.

export type PasskeyActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | {
      ok: false;
      error: string;
      /** "reauth": sign in again first. */
      reason?: "reauth";
      /** The server step's error code, for the browser step's messages. */
      code?: string;
    };

// auth.api calls skip Better Auth's HTTP rate limiter.
const registerLimiter = createRateLimiter({
  prefix: "qrdx:passkey-register",
  limiter: slidingWindow(10, "15 m"),
});
const changeLimiter = createRateLimiter({
  prefix: "qrdx:passkey-change",
  limiter: slidingWindow(30, "15 m"),
});

const PATH = "/settings/account";

const confirmed = () => confirmedSession(PASSKEY_MESSAGES.signedOut);

function failed(error: unknown, action: string) {
  const known = registrationFailure(error);
  if (known) {
    return {
      ok: false as const,
      error: known.message,
      ...(known.reauth ? { reason: "reauth" as const } : {}),
      code: (error as { body?: { code?: string } }).body?.code,
    };
  }
  logError(error as Error, { action });
  return { ok: false as const, error: PASSKEY_MESSAGES.failed };
}

/**
 * Step 1 of adding a passkey: the options for the browser's passkey prompt.
 * The challenge goes into a signed, short-lived cookie for step 2, which
 * only works with this step's challenge (used once, for this user, minutes
 * long).
 */
export async function passkeyRegistrationOptions(): Promise<
  PasskeyActionResult<Record<string, unknown>>
> {
  try {
    const allowed = await confirmed();
    if (!allowed.ok) return allowed;
    if (!(await registerLimiter.limit(allowed.session.userId)).success) {
      return { ok: false, error: PASSKEY_MESSAGES.rateLimited };
    }
    const { headers: responseHeaders, response } =
      await auth.api.generatePasskeyRegistrationOptions({
        headers: allowed.session.requestHeaders,
        returnHeaders: true,
      });
    const jar = await cookies();
    for (const cookie of cookiesToSet(responseHeaders)) {
      jar.set(cookie.name, cookie.value, cookie.options);
    }
    return { ok: true, data: response as Record<string, unknown> };
  } catch (error) {
    return failed(error, "account.passkeyRegistrationOptions");
  }
}

const verifySchema = z.object({
  response: z.record(z.string(), z.unknown()),
  name: z.string().max(500).optional(),
});

export interface AddedPasskey {
  id: string;
  /**
   * Adding it turned two-step verification on: the new backup codes, shown
   * once. Null when it was already on.
   */
  backupCodes: string[] | null;
  /** Saved, but two-step verification couldn't be turned on (try again). */
  turnOnFailed?: boolean;
}

/** Step 2: checks the new passkey against the challenge and saves it. */
export async function addPasskey(
  input: unknown,
): Promise<PasskeyActionResult<AddedPasskey>> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: PASSKEY_MESSAGES.failed };
  let session: ConfirmableSession;
  let saved: { id: string; name?: string | null };
  let wasOn: boolean;
  try {
    const allowed = await confirmed();
    if (!allowed.ok) return allowed;
    session = allowed.session;
    wasOn = (await loadTwoFactorFacts(session.userId)).on;
    const name =
      normalizePasskeyName(parsed.data.name) ??
      defaultPasskeyName(session.requestHeaders.get("user-agent"));
    saved = await auth.api.verifyPasskeyRegistration({
      headers: session.requestHeaders,
      body: { response: parsed.data.response, name },
    });
  } catch (error) {
    return failed(error, "account.addPasskey");
  }

  const passkeyName = saved.name ?? "Passkey";
  after(() =>
    sendPasskeyNotice({ email: session.email, change: "added", passkeyName }),
  );
  revalidatePath(PATH);
  if (wasOn) return { ok: true, data: { id: saved.id, backupCodes: null } };

  // The first method: two-step verification turns on.
  try {
    const backupCodes = await turnOnWithPasskeys(session);
    return { ok: true, data: { id: saved.id, backupCodes } };
  } catch (error) {
    logError(error as Error, { action: "account.addPasskey.turnOn" });
    return {
      ok: true,
      data: { id: saved.id, backupCodes: null, turnOnFailed: true },
    };
  }
}

const idSchema = z.string().min(1).max(200);

/** The signed-in user's passkey by id, if it's theirs. */
async function ownPasskey(session: ConfirmableSession, id: string) {
  const passkeys = (await auth.api.listPasskeys({
    headers: session.requestHeaders,
  })) as { id: string; name?: string | null }[];
  return { passkey: passkeys.find((passkey) => passkey.id === id) ?? null };
}

export async function renamePasskey(
  input: unknown,
): Promise<PasskeyActionResult> {
  const parsed = z
    .object({ id: idSchema, name: z.string().max(500) })
    .safeParse(input);
  const name = parsed.success ? normalizePasskeyName(parsed.data.name) : null;
  if (!(parsed.success && name)) {
    return { ok: false, error: PASSKEY_MESSAGES.invalidName };
  }
  try {
    const allowed = await confirmed();
    if (!allowed.ok) return allowed;
    const { session } = allowed;
    if (!(await changeLimiter.limit(session.userId)).success) {
      return { ok: false, error: PASSKEY_MESSAGES.rateLimited };
    }
    if (!(await ownPasskey(session, parsed.data.id)).passkey) {
      return { ok: false, error: PASSKEY_MESSAGES.notFound };
    }
    await auth.api.updatePasskey({
      headers: session.requestHeaders,
      body: { id: parsed.data.id, name },
    });
  } catch (error) {
    logError(error as Error, { action: "account.renamePasskey" });
    return { ok: false, error: PASSKEY_MESSAGES.failed };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Removes a passkey. When it's the last method of two-step verification (no
 * other passkey, no authenticator app), two-step verification turns off too;
 * the dialog says so first.
 */
export async function removePasskey(
  input: unknown,
): Promise<PasskeyActionResult<{ turnedOff: boolean }>> {
  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: PASSKEY_MESSAGES.notFound };
  let session: ConfirmableSession;
  let passkeyName: string;
  let turnsOff: boolean;
  try {
    const allowed = await confirmed();
    if (!allowed.ok) return allowed;
    session = allowed.session;
    if (!(await changeLimiter.limit(session.userId)).success) {
      return { ok: false, error: PASSKEY_MESSAGES.rateLimited };
    }
    const { passkey } = await ownPasskey(session, parsed.data.id);
    if (!passkey) return { ok: false, error: PASSKEY_MESSAGES.notFound };
    passkeyName = normalizePasskeyName(passkey.name) ?? "Passkey";
    await auth.api.deletePasskey({
      headers: session.requestHeaders,
      body: { id: parsed.data.id },
    });
    // Counted again after the delete, so two removals at once (or the app
    // removed meanwhile) can't leave it on with no method.
    turnsOff = await turnOffIfNoMethodLeft(session.userId);
  } catch (error) {
    logError(error as Error, { action: "account.removePasskey" });
    return { ok: false, error: PASSKEY_MESSAGES.failed };
  }
  after(() =>
    sendPasskeyNotice({ email: session.email, change: "removed", passkeyName }),
  );
  if (turnsOff) after(() => sendTwoFactorNotice("off", session.email));
  revalidatePath(PATH);
  return { ok: true, data: { turnedOff: turnsOff } };
}
