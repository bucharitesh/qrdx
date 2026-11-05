"use server";

import { cookiesToSet } from "@repo/auth/passkey";
import { auth } from "@repo/auth/server";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { canChangeEmailNow } from "@/lib/account/email-change";
import {
  defaultPasskeyName,
  normalizePasskeyName,
  PASSKEY_MESSAGES,
  registrationFailure,
} from "@/lib/account/passkeys";
import { sendPasskeyNotice } from "@/lib/account/passkeys-server";
import { logError } from "@/lib/shared";

// Settings → Profile & security → Passkeys. Better Auth's endpoints for
// adding, renaming and removing passkeys are off over HTTP (packages/auth/
// passkey.ts), so these actions are the only way in: adding needs a sign-in
// within the last day (the plugin's own fresh-session rule, and the one email
// changes use), every change is limited per user, and adding or removing one
// emails the account's address.

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

interface SignedIn {
  userId: string;
  email: string;
  sessionCreatedAt: Date;
  requestHeaders: Headers;
}

async function signedIn(): Promise<SignedIn | null> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) return null;
  return {
    userId: session.user.id,
    email: session.user.email,
    sessionCreatedAt: new Date(session.session.createdAt),
    requestHeaders,
  };
}

const reauth = () =>
  ({
    ok: false,
    error: PASSKEY_MESSAGES.reauth,
    reason: "reauth",
  }) as const;

/** Signed in recently enough to add a passkey, and within the limit. */
async function mayAdd(): Promise<
  { ok: true; user: SignedIn } | { ok: false; error: string; reason?: "reauth" }
> {
  const user = await signedIn();
  if (!user) return { ok: false, error: PASSKEY_MESSAGES.signedOut };
  if (!canChangeEmailNow(user.sessionCreatedAt, new Date())) return reauth();
  if (!(await registerLimiter.limit(user.userId)).success) {
    return { ok: false, error: PASSKEY_MESSAGES.rateLimited };
  }
  return { ok: true, user };
}

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
 * The challenge goes into a signed, short-lived cookie for step 2.
 */
export async function passkeyRegistrationOptions(): Promise<
  PasskeyActionResult<Record<string, unknown>>
> {
  try {
    const allowed = await mayAdd();
    if (!allowed.ok) return allowed;
    const { headers: responseHeaders, response } =
      await auth.api.generatePasskeyRegistrationOptions({
        headers: allowed.user.requestHeaders,
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

/** Step 2: checks the new passkey against the challenge and saves it. */
export async function addPasskey(
  input: unknown,
): Promise<PasskeyActionResult<{ id: string }>> {
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: PASSKEY_MESSAGES.failed };
  let user: SignedIn;
  let saved: { id: string; name?: string | null };
  try {
    const current = await signedIn();
    if (!current) return { ok: false, error: PASSKEY_MESSAGES.signedOut };
    if (!canChangeEmailNow(current.sessionCreatedAt, new Date())) {
      return reauth();
    }
    user = current;
    const name =
      normalizePasskeyName(parsed.data.name) ??
      defaultPasskeyName(user.requestHeaders.get("user-agent"));
    saved = await auth.api.verifyPasskeyRegistration({
      headers: user.requestHeaders,
      body: { response: parsed.data.response, name },
    });
  } catch (error) {
    return failed(error, "account.addPasskey");
  }

  const passkeyName = saved.name ?? "Passkey";
  after(() =>
    sendPasskeyNotice({ email: user.email, change: "added", passkeyName }),
  );
  revalidatePath(PATH);
  return { ok: true, data: { id: saved.id } };
}

const idSchema = z.string().min(1).max(200);

/** The signed-in user's passkey by id, if it's theirs. */
async function ownPasskey(user: SignedIn, id: string) {
  const passkeys = (await auth.api.listPasskeys({
    headers: user.requestHeaders,
  })) as { id: string; name?: string | null }[];
  return passkeys.find((passkey) => passkey.id === id) ?? null;
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
    const user = await signedIn();
    if (!user) return { ok: false, error: PASSKEY_MESSAGES.signedOut };
    if (!(await changeLimiter.limit(user.userId)).success) {
      return { ok: false, error: PASSKEY_MESSAGES.rateLimited };
    }
    if (!(await ownPasskey(user, parsed.data.id))) {
      return { ok: false, error: PASSKEY_MESSAGES.notFound };
    }
    await auth.api.updatePasskey({
      headers: user.requestHeaders,
      body: { id: parsed.data.id, name },
    });
  } catch (error) {
    logError(error as Error, { action: "account.renamePasskey" });
    return { ok: false, error: PASSKEY_MESSAGES.failed };
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function removePasskey(
  input: unknown,
): Promise<PasskeyActionResult> {
  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: PASSKEY_MESSAGES.notFound };
  let user: SignedIn;
  let passkeyName: string;
  try {
    const current = await signedIn();
    if (!current) return { ok: false, error: PASSKEY_MESSAGES.signedOut };
    user = current;
    if (!(await changeLimiter.limit(user.userId)).success) {
      return { ok: false, error: PASSKEY_MESSAGES.rateLimited };
    }
    const passkey = await ownPasskey(user, parsed.data.id);
    if (!passkey) return { ok: false, error: PASSKEY_MESSAGES.notFound };
    passkeyName = normalizePasskeyName(passkey.name) ?? "Passkey";
    await auth.api.deletePasskey({
      headers: user.requestHeaders,
      body: { id: parsed.data.id },
    });
  } catch (error) {
    logError(error as Error, { action: "account.removePasskey" });
    return { ok: false, error: PASSKEY_MESSAGES.failed };
  }
  after(() =>
    sendPasskeyNotice({ email: user.email, change: "removed", passkeyName }),
  );
  revalidatePath(PATH);
  return { ok: true };
}
