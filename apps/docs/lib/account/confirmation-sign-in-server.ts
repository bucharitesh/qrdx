import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import {
  CONFIRM_SIGN_IN_COOKIE,
  CONFIRM_SIGN_IN_MINUTES,
  confirmSignInIdentifier,
  parseConfirmSignInIntent,
} from "@repo/auth/confirm-sign-in";
import {
  database as db,
  session as sessionTable,
  verification,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { logError } from "@/lib/shared";
import {
  CONFIRMATION_MESSAGES,
  confirmSignInErrorMessage,
  isConfirmSignInProvider,
} from "./confirmation";
import {
  type ConfirmableSession,
  currentSession,
  loadConfirmationOptions,
  recordConfirmation,
} from "./confirmation-server";

// "Confirm it's you" by signing in again with a linked Google, GitHub or
// workspace SSO account, for accounts without two-step verification. The
// provider checks the person again, which a stolen session cookie can't do.
//
// 1. startSignInConfirmation: a `verification` row (who asked, from which
//    session, 10 minutes) named by the SHA-256 of a random value, and that
//    value in an HttpOnly cookie. The dialog then signs in as usual.
// 2. On the way back, Better Auth's hooks (packages/auth/confirm-sign-in.ts)
//    refuse a new account or a sign-in as anyone else.
// 3. finishSignInConfirmation, on the page it came back to: the row is used
//    up, and the session must belong to the person who asked and have been
//    made after they asked (a new sign-in, not the one they had). Then this
//    session gets its 10 minutes, and the session it replaced in this
//    browser is signed out.

export type SignInStartResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

export type SignInFinishResult = { ok: true } | { ok: false; error: string };

// Starting one is cheap but redirects to the provider: a few a minute is
// plenty for a person (Redis-backed; without Redis it allows everything).
const startLimiter = createRateLimiter({
  prefix: "qrdx:confirm-sign-in",
  limiter: slidingWindow(10, "15 m"),
});

const startInput = z.object({ provider: z.string().max(16) });

/**
 * Step 1. Answers the address the SSO sign-in needs (the person's own);
 * Google and GitHub ignore it.
 */
export async function startSignInConfirmation(
  input: unknown,
): Promise<SignInStartResult> {
  const parsed = startInput.safeParse(input);
  if (!(parsed.success && isConfirmSignInProvider(parsed.data.provider))) {
    return { ok: false, error: CONFIRMATION_MESSAGES.signInUnavailable };
  }
  const provider = parsed.data.provider;
  try {
    const session = await currentSession();
    if (!session) return { ok: false, error: CONFIRMATION_MESSAGES.signedOut };
    // The same list the dialog shows: never with two-step verification on.
    const { methods } = await loadConfirmationOptions(session);
    if (!methods.includes(provider)) {
      return { ok: false, error: CONFIRMATION_MESSAGES.signInUnavailable };
    }
    if (!(await startLimiter.limit(session.userId)).success) {
      return { ok: false, error: CONFIRMATION_MESSAGES.rateLimited };
    }

    const nonce = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + CONFIRM_SIGN_IN_MINUTES * 60_000,
    );
    await db.insert(verification).values({
      id: randomUUID(),
      identifier: confirmSignInIdentifier(nonce),
      value: JSON.stringify({
        userId: session.userId,
        provider,
        fromSessionId: session.sessionId,
      }),
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    const jar = await cookies();
    jar.set(CONFIRM_SIGN_IN_COOKIE, nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CONFIRM_SIGN_IN_MINUTES * 60,
    });
    return { ok: true, email: session.email };
  } catch (error) {
    logError(error as Error, { action: "account.startSignInConfirmation" });
    return { ok: false, error: CONFIRMATION_MESSAGES.failed };
  }
}

/** The rules for step 3, on the row and the session it came back with. */
export function signInConfirmationProblem({
  intent,
  rowCreatedAt,
  session,
  now,
}: {
  intent: { userId: string; fromSessionId: string };
  rowCreatedAt: Date;
  session: Pick<
    ConfirmableSession,
    "userId" | "sessionId" | "sessionCreatedAt"
  >;
  now: Date;
}): string | null {
  if (session.userId !== intent.userId) {
    return CONFIRMATION_MESSAGES.signInDifferentAccount;
  }
  const made = session.sessionCreatedAt.getTime();
  if (
    session.sessionId === intent.fromSessionId ||
    made < rowCreatedAt.getTime() ||
    now.getTime() - made > CONFIRM_SIGN_IN_MINUTES * 60_000
  ) {
    // Came back without a new sign-in (or a very late one).
    return CONFIRMATION_MESSAGES.signInFailed;
  }
  return null;
}

const finishInput = z.object({
  failed: z.boolean(),
  error: z.string().max(64).nullable(),
});

/**
 * Step 3, on the page the sign-in came back to (`?confirm=signed-in`, or
 * `?confirm=sign-in-failed&error=…` when the provider or Better Auth's hooks
 * refused it). Either way the row and the cookie are used up.
 */
export async function finishSignInConfirmation(
  input: unknown,
): Promise<SignInFinishResult> {
  const parsed = finishInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: CONFIRMATION_MESSAGES.signInFailed };
  }
  try {
    const jar = await cookies();
    const nonce = jar.get(CONFIRM_SIGN_IN_COOKIE)?.value ?? null;
    if (nonce) jar.delete(CONFIRM_SIGN_IN_COOKIE);
    const [row] = nonce
      ? await db
          .delete(verification)
          .where(eq(verification.identifier, confirmSignInIdentifier(nonce)))
          .returning({
            value: verification.value,
            createdAt: verification.createdAt,
            expiresAt: verification.expiresAt,
          })
      : [];
    if (parsed.data.failed) {
      return { ok: false, error: confirmSignInErrorMessage(parsed.data.error) };
    }
    const intent = row ? parseConfirmSignInIntent(row.value) : null;
    if (!(row?.createdAt && intent)) {
      return { ok: false, error: CONFIRMATION_MESSAGES.signInFailed };
    }
    const now = new Date();
    if (new Date(row.expiresAt).getTime() <= now.getTime()) {
      return { ok: false, error: CONFIRMATION_MESSAGES.signInExpired };
    }
    const session = await currentSession();
    if (!session) return { ok: false, error: CONFIRMATION_MESSAGES.signedOut };
    const problem = signInConfirmationProblem({
      intent,
      rowCreatedAt: new Date(row.createdAt),
      session,
      now,
    });
    if (problem) return { ok: false, error: problem };

    await recordConfirmation(session);
    // The session this browser had before: its cookie was replaced, so
    // only someone holding a copy could still use it.
    await db
      .delete(sessionTable)
      .where(
        and(
          eq(sessionTable.id, intent.fromSessionId),
          eq(sessionTable.userId, session.userId),
        ),
      );
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.finishSignInConfirmation" });
    return { ok: false, error: CONFIRMATION_MESSAGES.failed };
  }
}
