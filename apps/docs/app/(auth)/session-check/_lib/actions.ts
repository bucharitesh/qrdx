"use server";

import {
  type ConfirmationRequired,
  confirmationRequired,
} from "@/lib/account/confirmation";
import { currentSession } from "@/lib/account/confirmation-server";
import { SESSION_CHECK_MESSAGES } from "@/lib/account/session-origin";
import { logError } from "@/lib/shared";

/**
 * The check page's question (lib/account/session-origin.ts): CONFIRMATION_
 * REQUIRED while this session is held, so useConfirmation() opens "Confirm
 * it's you" and asks again once it's answered (which lets the session go).
 */
export async function checkSession(): Promise<
  { ok: true } | ConfirmationRequired | { ok: false; error: string }
> {
  try {
    const session = await currentSession();
    if (!session) return { ok: false, error: SESSION_CHECK_MESSAGES.signedOut };
    return session.held ? confirmationRequired() : { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.checkSession" });
    return { ok: false, error: SESSION_CHECK_MESSAGES.failed };
  }
}
