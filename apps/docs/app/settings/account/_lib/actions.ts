"use server";

import { auth } from "@repo/auth/server";
import { database as db, session as sessionTable } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import {
  AVATAR_MAX_BYTES,
  type AvatarMime,
  avatarKey,
  avatarKeyFromImage,
} from "@/lib/account/avatar";
import {
  type LinkedAccount,
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

/** Better Auth APIError code (e.g. "SESSION_NOT_FRESH"), if any. */
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

export async function unlinkSignInMethod(
  input: unknown,
): Promise<AccountActionResult> {
  const parsed = z.object({ accountId: idSchema }).safeParse(input);
  if (!parsed.success) return fail("Invalid sign-in method.");
  try {
    const user = await signedIn();
    if (!user) return fail("Sign in to manage sign-in methods.");
    if (!(await securityLimiter.limit(user.userId)).success) {
      return fail(RATE_LIMITED);
    }
    const accounts: LinkedAccount[] = await auth.api.listUserAccounts({
      headers: user.requestHeaders,
    });
    const blocked = unlinkBlockReason(accounts, parsed.data.accountId);
    if (blocked) return fail(UNLINK_BLOCK_MESSAGES[blocked]);

    await auth.api.unlinkAccount({
      headers: user.requestHeaders,
      body: { accountId: parsed.data.accountId },
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    switch (authErrorCode(error)) {
      case "SESSION_NOT_FRESH":
        return fail(
          "For your security, sign out and sign in again before removing a sign-in method.",
        );
      case "FAILED_TO_UNLINK_LAST_ACCOUNT":
        return fail(UNLINK_BLOCK_MESSAGES["last-method"]);
      case "ACCOUNT_NOT_FOUND":
        return fail(UNLINK_BLOCK_MESSAGES["not-found"]);
    }
    logError(error as Error, { action: "account.unlink" });
    return fail(SOMETHING_WRONG);
  }
}

// ─── Sessions ───────────────────────────────────────────────────────────────

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
