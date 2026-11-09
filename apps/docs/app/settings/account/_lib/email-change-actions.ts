"use server";

import { registerEmailChangeCodeSender } from "@repo/auth/email-otp";
import { auth } from "@repo/auth/server";
import { emailChangeSsoProblem } from "@repo/auth/sso-required";
import { database as db, session as sessionTable } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { ssoEmailChangeMessage } from "@/ee/sso/messages";
import {
  currentSession,
  requireRecentConfirmation,
} from "@/lib/account/confirmation-server";
import {
  confirmFailure,
  EMAIL_CHANGE_MESSAGES,
  isSameEmail,
  MAX_EMAIL_LENGTH,
  normalizeEmail,
  requestFailureMessage,
} from "@/lib/account/email-change";
import { afterEmailChanged } from "@/lib/account/email-change-server";
import { sendEmailChangeCode } from "@/lib/auth/email-change-code";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { logError } from "@/lib/shared";

// Settings → Account → Email. Better Auth's email-change endpoints are off
// over HTTP (packages/auth/server.ts), so these actions are the only way in:
// both steps need a recent "Confirm it's you" (lib/account/confirmation.ts:
// a passkey, authenticator or backup code with two-step verification on;
// without it a passkey, a code to the current address, or signing in again
// with a linked Google, GitHub or SSO account) and answer
// CONFIRMATION_REQUIRED without one. They limit each user, sign out the
// account's other sessions and tell the old address. The plugin emails the
// code through the sender registered here.
registerEmailChangeCodeSender(sendEmailChangeCode);

export type EmailChangeResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** "code-dead": send a new code. */
      reason?: "code-dead";
    };

// Per user, on top of the per-address limits in lib/auth/email-change-code.tsx
// (auth.api calls skip Better Auth's own HTTP rate limiter).
const requestLimiter = createRateLimiter({
  prefix: "qrdx:email-change-request",
  limiter: slidingWindow(5, "15 m"),
});
const confirmLimiter = createRateLimiter({
  prefix: "qrdx:email-change-confirm",
  limiter: slidingWindow(10, "15 m"),
});

const fail = (error: string, reason?: "code-dead"): EmailChangeResult =>
  reason ? { ok: false, error, reason } : { ok: false, error };

const newEmailSchema = z
  .string()
  .trim()
  .max(MAX_EMAIL_LENGTH)
  .pipe(z.email())
  .transform(normalizeEmail);

const codeSchema = z.string().regex(/^\d{6}$/);

interface Allowed {
  userId: string;
  email: string;
  sessionId: string;
  requestHeaders: Headers;
}

/** The signed-in user, if they may change their email to `newEmail` now. */
async function mayChange(
  newEmail: string,
): Promise<
  { ok: true; user: Allowed } | { ok: false; result: EmailChangeResult }
> {
  const session = await currentSession();
  if (!session) {
    return { ok: false, result: fail(EMAIL_CHANGE_MESSAGES.signedOut) };
  }
  if (isSameEmail(newEmail, session.email)) {
    return { ok: false, result: fail(EMAIL_CHANGE_MESSAGES.sameEmail) };
  }
  // Never onto or off a domain whose company requires single sign-on
  // (packages/auth/ee/sso-required.ts); said before "Confirm it's you", which
  // wouldn't change the answer.
  if (isFeatureAvailable("sso")) {
    const problem = await emailChangeSsoProblem(
      session.userId,
      session.email,
      newEmail,
    );
    if (problem) {
      return { ok: false, result: fail(ssoEmailChangeMessage(problem)) };
    }
  }
  const needed = await requireRecentConfirmation(session);
  if (needed) return { ok: false, result: needed };
  return {
    ok: true,
    user: {
      userId: session.userId,
      email: session.email,
      sessionId: session.sessionId,
      requestHeaders: session.requestHeaders,
    },
  };
}

/** Step 1: email a 6-digit code to the new address. */
export async function requestEmailChange(
  input: unknown,
): Promise<EmailChangeResult> {
  const parsed = z.object({ newEmail: newEmailSchema }).safeParse(input);
  if (!parsed.success) return fail(EMAIL_CHANGE_MESSAGES.invalidEmail);
  const { newEmail } = parsed.data;
  try {
    const allowed = await mayChange(newEmail);
    if (!allowed.ok) return allowed.result;
    const { user } = allowed;
    if (!(await requestLimiter.limit(user.userId)).success) {
      return fail(EMAIL_CHANGE_MESSAGES.rateLimited);
    }
    // Answers the same whether or not the address already has an account
    // (then no code is sent), so the form can't be used to look addresses up.
    await auth.api.requestEmailChangeEmailOTP({
      headers: user.requestHeaders,
      body: { newEmail },
    });
    return { ok: true };
  } catch (error) {
    const message = requestFailureMessage(error);
    if (message) return fail(message);
    logError(error as Error, { action: "account.requestEmailChange" });
    return fail(EMAIL_CHANGE_MESSAGES.failed);
  }
}

/** Step 2: the code from the new address makes the change. */
export async function confirmEmailChange(
  input: unknown,
): Promise<EmailChangeResult> {
  const parsed = z
    .object({
      newEmail: newEmailSchema,
      code: codeSchema,
    })
    .safeParse(input);
  if (!parsed.success) {
    const codeIssue = parsed.error.issues.some((i) => i.path[0] === "code");
    return fail(
      codeIssue
        ? EMAIL_CHANGE_MESSAGES.invalidCode
        : EMAIL_CHANGE_MESSAGES.invalidEmail,
    );
  }
  const { newEmail, code } = parsed.data;
  let user: Allowed;
  try {
    const allowed = await mayChange(newEmail);
    if (!allowed.ok) return allowed.result;
    user = allowed.user;
    if (!(await confirmLimiter.limit(user.userId)).success) {
      return fail(EMAIL_CHANGE_MESSAGES.rateLimited);
    }
    // Checks and uses up the code, re-checks that no other account has the
    // address, then updates the user (marked verified: the code proves it).
    await auth.api.changeEmailEmailOTP({
      headers: user.requestHeaders,
      body: { newEmail, otp: code },
    });
  } catch (error) {
    const failure = confirmFailure(error);
    if (failure) {
      return fail(failure.message, failure.codeDead ? "code-dead" : undefined);
    }
    logError(error as Error, { action: "account.confirmEmailChange" });
    return fail(EMAIL_CHANGE_MESSAGES.failed);
  }

  // Changed. Every other session is signed out, so a browser someone else
  // had open doesn't carry on under the new address; this one stays.
  try {
    await db
      .delete(sessionTable)
      .where(
        and(
          eq(sessionTable.userId, user.userId),
          ne(sessionTable.id, user.sessionId),
        ),
      );
  } catch (error) {
    // The email has changed either way; Sessions in Settings still works.
    logError(error as Error, { action: "account.confirmEmailChange.sessions" });
  }

  // The notice and Polar run after the response, best effort, and never
  // undo it.
  const changed = {
    userId: user.userId,
    previousEmail: user.email,
    newEmail,
  };
  after(() => afterEmailChanged(changed));
  revalidatePath("/settings/account");
  return { ok: true };
}
