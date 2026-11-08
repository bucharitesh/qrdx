"use server";

import { cookiesToSet } from "@repo/auth/passkey";
import { auth } from "@repo/auth/server";
import {
  account as accountTable,
  database as db,
  session as sessionTable,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import {
  AVATAR_MAX_BYTES,
  type AvatarMime,
  avatarKey,
  avatarKeyFromImage,
} from "@/lib/account/avatar";
import { confirmedSession } from "@/lib/account/confirmation-server";
import {
  type LinkedAccount,
  PROVIDER_LABELS,
  SOCIAL_PROVIDERS,
  UNLINK_BLOCK_MESSAGES,
  unlinkBlockReason,
} from "@/lib/account/sign-in-methods";
import { SNIFF_BYTES, sniffFileType } from "@/lib/files/magic";
import { baseUrl } from "@/lib/metadata";
import { logError } from "@/lib/shared";
import {
  deleteObject,
  isStorageConfigured,
  publicUrl,
  putObject,
} from "@/lib/storage/r2";

// Settings → Account. auth.api calls bypass Better Auth's HTTP rate limiter,
// so every action is limited per user here.
//
// Linking and unlinking Google or GitHub change how the account can be
// signed in to, so both need a recent "Confirm it's you"
// (lib/account/confirmation.ts) and answer CONFIRMATION_REQUIRED without one.
// Over HTTP, Better Auth's /link-social and /unlink-account ask the same
// (packages/auth/confirm-gate.ts). Signing out sessions never asks: someone
// whose account is under attack must be able to sign the attacker out at once.

export type AccountActionResult = { ok: true } | { ok: false; error: string };

const profileLimiter = createRateLimiter({
  prefix: "qrdx:account-profile",
  limiter: slidingWindow(20, "10 m"),
});
const securityLimiter = createRateLimiter({
  prefix: "qrdx:account-security",
  limiter: slidingWindow(20, "10 m"),
});

const RATE_LIMITED = "Too many changes. Wait a few minutes and try again.";
const SOMETHING_WRONG = "Something went wrong. Please try again.";
const PATH = "/settings/account";

const fail = (error: string): AccountActionResult => ({ ok: false, error });

interface SignedIn {
  userId: string;
  image: string | null;
  sessionId: string;
  requestHeaders: Headers;
}

async function signedIn(): Promise<SignedIn | null> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) return null;
  return {
    userId: session.user.id,
    image: session.user.image ?? null,
    sessionId: session.session.id,
    requestHeaders,
  };
}

/** Better Auth APIError code (e.g. "PROVIDER_NOT_FOUND"), if any. */
function authErrorCode(error: unknown): string | undefined {
  return (error as { body?: { code?: string } })?.body?.code;
}

// ─── Profile ────────────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(64, "Use 64 characters or fewer.")
  .refine(
    (value) => !CONTROL_CHARACTERS.test(value),
    "Remove special characters.",
  );

export async function updateProfileName(
  input: unknown,
): Promise<AccountActionResult> {
  const parsed = z.object({ name: nameSchema }).safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Enter your name.");
  }
  try {
    const user = await signedIn();
    if (!user) return fail("Sign in to change your profile.");
    if (!(await profileLimiter.limit(user.userId)).success) {
      return fail(RATE_LIMITED);
    }
    await auth.api.updateUser({
      headers: user.requestHeaders,
      body: { name: parsed.data.name },
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.updateName" });
    return fail(SOMETHING_WRONG);
  }
}

const SNIFFED_AVATAR_MIME: Partial<Record<string, AvatarMime>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** The browser sends a cropped, re-encoded square (see avatar-field.tsx). */
export async function uploadAvatar(
  formData: FormData,
): Promise<AccountActionResult & { image?: string }> {
  try {
    const user = await signedIn();
    if (!user) return fail("Sign in to change your profile.");
    if (!isStorageConfigured) {
      return fail("Picture uploads aren't set up on this server.");
    }
    const file = formData.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      return fail("Choose a picture to upload.");
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return fail("That picture is too large. Try a smaller one.");
    }
    if (!(await profileLimiter.limit(user.userId)).success) {
      return fail(RATE_LIMITED);
    }

    // The bytes decide the type, whatever the browser said.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffFileType(bytes.subarray(0, SNIFF_BYTES));
    const mime = sniffed ? SNIFFED_AVATAR_MIME[sniffed] : undefined;
    if (!mime) return fail("Use a PNG, JPEG or WebP picture.");

    const key = avatarKey(user.userId, cuid(), mime);
    await putObject(key, bytes, {
      mime,
      // Every upload gets a new key, so the object never changes.
      cacheControl: "public, max-age=31536000, immutable",
    });
    // Public bucket URL, else /api/avatars/<userId>/<file> (signed redirect).
    const image = publicUrl(key) ?? new URL(`/api/${key}`, baseUrl).toString();

    await auth.api.updateUser({
      headers: user.requestHeaders,
      body: { image },
    });
    const previous = avatarKeyFromImage(user.image, user.userId);
    if (previous && previous !== key) {
      await deleteObject(previous).catch((error) =>
        logError(error as Error, { action: "account.avatar.deletePrevious" }),
      );
    }
    revalidatePath(PATH);
    return { ok: true, image };
  } catch (error) {
    logError(error as Error, { action: "account.uploadAvatar" });
    return fail(SOMETHING_WRONG);
  }
}

export async function removeAvatar(): Promise<AccountActionResult> {
  try {
    const user = await signedIn();
    if (!user) return fail("Sign in to change your profile.");
    if (!(await profileLimiter.limit(user.userId)).success) {
      return fail(RATE_LIMITED);
    }
    await auth.api.updateUser({
      headers: user.requestHeaders,
      body: { image: null },
    });
    const previous = avatarKeyFromImage(user.image, user.userId);
    if (previous && isStorageConfigured) {
      await deleteObject(previous).catch((error) =>
        logError(error as Error, { action: "account.avatar.delete" }),
      );
    }
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.removeAvatar" });
    return fail(SOMETHING_WRONG);
  }
}

// ─── Sign-in methods ────────────────────────────────────────────────────────

const idSchema = z.string().trim().min(1).max(128);
const SIGNED_OUT_METHODS = "Sign in to manage sign-in methods.";

export type LinkStartResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

const linkFail = (error: string): LinkStartResult => ({ ok: false, error });

/**
 * "Link" for Google or GitHub: after a recent "Confirm it's you", starts
 * Better Auth's link flow and answers the provider's URL for the browser to
 * open. The flow's state cookie is passed on to the browser; the provider
 * comes back to Better Auth's callback, which links the account (same email
 * only) and returns to Settings with ?linked= or ?error=.
 */
export async function linkSignInMethod(
  input: unknown,
): Promise<LinkStartResult> {
  const parsed = z
    .object({ provider: z.enum(SOCIAL_PROVIDERS) })
    .safeParse(input);
  if (!parsed.success) return linkFail("That sign-in method can't be linked.");
  const { provider } = parsed.data;
  const unavailable = `${PROVIDER_LABELS[provider]} can't be linked right now.`;
  try {
    const allowed = await confirmedSession(SIGNED_OUT_METHODS);
    if (!allowed.ok) return allowed;
    const { session } = allowed;
    if (!(await securityLimiter.limit(session.userId)).success) {
      return linkFail(RATE_LIMITED);
    }
    const { headers: responseHeaders, response } =
      await auth.api.linkSocialAccount({
        headers: session.requestHeaders,
        body: {
          provider,
          callbackURL: `${PATH}?linked=${provider}#sign-in`,
          errorCallbackURL: PATH,
          disableRedirect: true,
        },
        returnHeaders: true,
      });
    const url = (response as { url?: unknown } | null)?.url;
    if (typeof url !== "string" || !url.startsWith("https://")) {
      throw new Error("The link flow returned no provider URL");
    }
    const jar = await cookies();
    for (const cookie of cookiesToSet(responseHeaders)) {
      jar.set(cookie.name, cookie.value, cookie.options);
    }
    return { ok: true, url };
  } catch (error) {
    // Not set up on this server: nothing to log.
    if (authErrorCode(error) !== "PROVIDER_NOT_FOUND") {
      logError(error as Error, { action: "account.link" });
    }
    return linkFail(unavailable);
  }
}

/**
 * "Unlink": after a recent "Confirm it's you", removes a Google or GitHub
 * link of this account. Better Auth's own unlink also wants a sign-in within
 * the last day, a weaker check than the confirmation (and one a confirmed
 * person would then be asked for again), so the row is deleted here, for
 * this user only, once the same checks have passed.
 */
export async function unlinkSignInMethod(
  input: unknown,
): Promise<AccountActionResult> {
  const parsed = z.object({ accountId: idSchema }).safeParse(input);
  if (!parsed.success) return fail("Invalid sign-in method.");
  try {
    const allowed = await confirmedSession(SIGNED_OUT_METHODS);
    if (!allowed.ok) return allowed;
    const { session } = allowed;
    if (!(await securityLimiter.limit(session.userId)).success) {
      return fail(RATE_LIMITED);
    }
    const accounts: LinkedAccount[] = await auth.api.listUserAccounts({
      headers: session.requestHeaders,
    });
    const blocked = unlinkBlockReason(accounts, parsed.data.accountId);
    if (blocked) return fail(UNLINK_BLOCK_MESSAGES[blocked]);

    const removed = await db
      .delete(accountTable)
      .where(
        and(
          eq(accountTable.id, parsed.data.accountId),
          eq(accountTable.userId, session.userId),
        ),
      )
      .returning({ id: accountTable.id });
    if (removed.length === 0) return fail(UNLINK_BLOCK_MESSAGES["not-found"]);
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.unlink" });
    return fail(SOMETHING_WRONG);
  }
}

// ─── Sessions ───────────────────────────────────────────────────────────────

// Never "Confirm it's you" here: someone whose account is under attack must
// be able to sign the attacker's sessions out at once.

export async function revokeSession(
  input: unknown,
): Promise<AccountActionResult> {
  const parsed = z.object({ sessionId: idSchema }).safeParse(input);
  if (!parsed.success) return fail("Invalid session.");
  try {
    const user = await signedIn();
    if (!user) return fail("Sign in to manage sessions.");
    if (parsed.data.sessionId === user.sessionId) {
      return fail("That's this device. Use Sign out in the menu instead.");
    }
    if (!(await securityLimiter.limit(user.userId)).success) {
      return fail(RATE_LIMITED);
    }
    // Tokens never reach the browser: look this one up by id, for this user only.
    const [row] = await db
      .select({ token: sessionTable.token })
      .from(sessionTable)
      .where(
        and(
          eq(sessionTable.id, parsed.data.sessionId),
          eq(sessionTable.userId, user.userId),
        ),
      )
      .limit(1);
    if (row) {
      await auth.api.revokeSession({
        headers: user.requestHeaders,
        body: { token: row.token },
      });
    }
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.revokeSession" });
    return fail(SOMETHING_WRONG);
  }
}

export async function revokeOtherSessions(): Promise<AccountActionResult> {
  try {
    const user = await signedIn();
    if (!user) return fail("Sign in to manage sessions.");
    if (!(await securityLimiter.limit(user.userId)).success) {
      return fail(RATE_LIMITED);
    }
    await auth.api.revokeOtherSessions({ headers: user.requestHeaders });
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.revokeOtherSessions" });
    return fail(SOMETHING_WRONG);
  }
}
