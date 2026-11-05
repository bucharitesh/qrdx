"use server";

import { registerSignInCodeSender } from "@repo/auth/email-otp";
import { auth } from "@repo/auth/server";
import { database as db, session as sessionTable } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import {
  isDeleteConfirmed,
  isRecentSignIn,
  planAccountDeletion,
} from "@/lib/account/deletion";
import {
  AccountDeletionError,
  executeAccountDeletion,
  loadDeletionFacts,
} from "@/lib/account/deletion-server";
import { signInCodesAvailable } from "@/lib/account/reauth";
import {
  checkCurrentCode,
  twoFactorEnabledFor,
} from "@/lib/account/two-factor-manage";
import { sendSignInCode } from "@/lib/auth/sign-in-code";
import { secondFactorCodeKind } from "@/lib/auth/two-factor";
import { logError } from "@/lib/shared";

// The code that confirms a deletion is a sign-in code, emailed through the
// same sender as /api/auth registers (sendDeletionCode below).
registerSignInCodeSender(sendSignInCode);

export type DeleteAccountResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** The emailed code can't be used again: ask for a new one */
      codeExpired?: boolean;
    };

// Each attempt may burn an emailed code; codes allow 3 tries each.
const deleteLimiter = createRateLimiter({
  prefix: "qrdx:account-delete",
  limiter: slidingWindow(5, "15 m"),
});

// Per user, on top of the per-address limits in lib/auth/sign-in-code.tsx
// (auth.api calls skip Better Auth's own HTTP rate limiter).
const sendCodeLimiter = createRateLimiter({
  prefix: "qrdx:account-delete-code",
  limiter: slidingWindow(5, "15 m"),
});

const inputSchema = z.object({
  confirmation: z.string().max(64),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional(),
  /** With two-step verification on: an authenticator or backup code */
  twoFactorCode: z.string().max(64).optional(),
});

const ENTER_SECOND_FACTOR =
  "Enter a code from your authenticator app, or a backup code.";

const TWO_FACTOR_NO_EMAIL =
  "Two-step verification is on, so there's no emailed code. Use a code from your authenticator app, or a backup code.";

const CODE_RATE_LIMITED =
  "Too many codes requested. Try again in a few minutes.";

const fail = (error: string, codeExpired?: boolean): DeleteAccountResult =>
  codeExpired ? { ok: false, error, codeExpired } : { ok: false, error };

/** Better Auth email-OTP errors, worded for this dialog. */
function codeError(error: unknown): DeleteAccountResult {
  const { body, statusCode } = error as {
    body?: { code?: string };
    statusCode?: number;
  };
  switch (body?.code) {
    case "INVALID_OTP":
      return fail("That code isn't right. Check the email and try again.");
    case "OTP_EXPIRED":
      return fail("That code has expired. Send a new one.", true);
    case "TOO_MANY_ATTEMPTS":
      return fail("Too many wrong tries. Send a new code.", true);
  }
  if (statusCode === 429) {
    return fail("Too many tries. Wait a minute, then try again.");
  }
  throw error;
}

/**
 * Emails the sign-in code that confirms a deletion, to the account's own
 * address. Only for accounts without two-step verification: with it on, the
 * dialog asks for an authenticator or backup code instead, and a request
 * from here is refused.
 */
export async function sendDeletionCode(): Promise<DeleteAccountResult> {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    const userId: string | undefined = session?.user?.id;
    if (!userId) return fail("Sign in to delete your account.");
    if (await twoFactorEnabledFor(userId)) return fail(TWO_FACTOR_NO_EMAIL);
    if (!signInCodesAvailable()) {
      return fail(
        "For your security, sign out and sign in again, then delete your account within 10 minutes.",
      );
    }
    if (!(await sendCodeLimiter.limit(userId)).success) {
      return fail(CODE_RATE_LIMITED);
    }
    await auth.api.sendVerificationOTP({
      headers: requestHeaders,
      body: { email: session.user.email, type: "sign-in" },
    });
    return { ok: true };
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 429) {
      return fail(CODE_RATE_LIMITED);
    }
    logError(error as Error, { action: "sendDeletionCode" });
    return fail("We couldn't send a code right now. Please try again.");
  }
}

/**
 * Settings → Account → Delete account. Confirmed three ways: typing
 * "delete", the deletion plan the page showed (rebuilt here from current
 * data), and proof it's really you:
 * - two-step verification on: one current authenticator or backup code,
 *   through the same check and lockout as turning it off
 *   (lib/account/two-factor-manage.ts). No emailed code.
 * - off: a fresh sign-in code emailed to the account's address, or, where
 *   this deployment can't send codes, a sign-in within the last 10 minutes.
 */
export async function deleteAccount(
  input: unknown,
): Promise<DeleteAccountResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      parsed.error.issues.some((issue) => issue.path[0] === "twoFactorCode")
        ? ENTER_SECOND_FACTOR
        : "Enter the 6-digit code from the email.",
    );
  }
  if (!isDeleteConfirmed(parsed.data.confirmation)) {
    return fail('Type "delete" to confirm.');
  }

  let verificationToken: string | null = null;
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    const userId: string | undefined = session?.user?.id;
    if (!userId) return fail("Sign in to delete your account.");

    if (!(await deleteLimiter.limit(userId)).success) {
      return fail("Too many attempts. Wait 15 minutes and try again.");
    }

    // Blockers first: they must not cost the user their code.
    const plan = planAccountDeletion(await loadDeletionFacts(userId));
    if (plan.blockers.length > 0) return fail(plan.blockers[0]);

    if (await twoFactorEnabledFor(userId)) {
      // Any emailed code sent along is ignored, never used up.
      const twoFactorCode = parsed.data.twoFactorCode ?? "";
      if (!secondFactorCodeKind(twoFactorCode)) {
        return fail(ENTER_SECOND_FACTOR);
      }
      const check = await checkCurrentCode(
        { userId, requestHeaders },
        twoFactorCode,
      );
      if (!check.ok) return fail(check.error);
    } else if (signInCodesAvailable()) {
      if (!parsed.data.code)
        return fail("Enter the 6-digit code from the email.");
      try {
        // Verifies and uses up the code. Signing in this way also makes a
        // session, which is removed below (or with the account).
        const result = await auth.api.signInEmailOTP({
          headers: requestHeaders,
          body: { email: session.user.email, otp: parsed.data.code },
        });
        verificationToken = result?.token ?? null;
        if (result?.user?.id !== userId) {
          throw new Error("Sign-in code verified a different user");
        }
      } catch (error) {
        return codeError(error);
      }
    } else if (
      !isRecentSignIn(new Date(session.session.createdAt), new Date())
    ) {
      return fail(
        "For your security, sign out and sign in again, then delete your account within 10 minutes.",
      );
    }

    await executeAccountDeletion({ userId, plan, requestHeaders });
    verificationToken = null;
    return { ok: true };
  } catch (error) {
    if (error instanceof AccountDeletionError) return fail(error.message);
    logError(error as Error, { action: "deleteAccount" });
    return fail("We couldn't delete your account. Please try again.");
  } finally {
    // Deletion stopped after the code was used: drop the session it made.
    if (verificationToken) {
      await db
        .delete(sessionTable)
        .where(eq(sessionTable.token, verificationToken))
        .catch((error: unknown) =>
          logError(error as Error, { action: "deleteAccount.cleanupSession" }),
        );
    }
  }
}
