"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import { confirmedSession } from "@/lib/account/confirmation-server";
import { isDeleteConfirmed, planAccountDeletion } from "@/lib/account/deletion";
import {
  AccountDeletionError,
  executeAccountDeletion,
  loadDeletionFacts,
} from "@/lib/account/deletion-server";
import { logError } from "@/lib/shared";

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

const deleteLimiter = createRateLimiter({
  prefix: "qrdx:account-delete",
  limiter: slidingWindow(5, "15 m"),
});

const inputSchema = z.object({ confirmation: z.string().max(64) });

const fail = (error: string): DeleteAccountResult => ({ ok: false, error });

/**
 * Settings → Account → Delete account. Confirmed three ways: typing
 * "delete", the deletion plan the page showed (rebuilt here from current
 * data), and a recent "Confirm it's you" (lib/account/confirmation-server.ts:
 * a passkey, authenticator or backup code with two-step verification on,
 * else a code emailed to the account's address). Without the last it
 * answers CONFIRMATION_REQUIRED and the dialog asks, then tries again.
 */
export async function deleteAccount(
  input: unknown,
): Promise<DeleteAccountResult> {
  const parsed = inputSchema.safeParse(input);
  if (!(parsed.success && isDeleteConfirmed(parsed.data.confirmation))) {
    return fail('Type "delete" to confirm.');
  }

  try {
    const allowed = await confirmedSession("Sign in to delete your account.");
    if (!allowed.ok) return allowed;
    const { userId, requestHeaders } = allowed.session;

    if (!(await deleteLimiter.limit(userId)).success) {
      return fail("Too many attempts. Wait 15 minutes and try again.");
    }

    const plan = planAccountDeletion(await loadDeletionFacts(userId));
    if (plan.blockers.length > 0) return fail(plan.blockers[0]);

    await executeAccountDeletion({ userId, plan, requestHeaders });
    return { ok: true };
  } catch (error) {
    if (error instanceof AccountDeletionError) return fail(error.message);
    logError(error as Error, { action: "deleteAccount" });
    return fail("We couldn't delete your account. Please try again.");
  }
}
