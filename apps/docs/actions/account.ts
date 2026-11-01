"use server";

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
import { logError } from "@/lib/shared";

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

const inputSchema = z.object({
  confirmation: z.string().max(64),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional(),
});

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
 * Settings → Account → Delete account. Confirmed three ways: typing
 * "delete", a fresh sign-in code emailed to the account's address (or, where
 * this deployment can't send codes, a sign-in within the last 10 minutes),
 * and the deletion plan the page showed, rebuilt here from current data.
 */
export async function deleteAccount(
  input: unknown,
): Promise<DeleteAccountResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("Enter the 6-digit code from the email.");
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

    if (signInCodesAvailable()) {
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
