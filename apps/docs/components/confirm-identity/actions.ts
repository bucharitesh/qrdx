"use server";

import {
  CONFIRMATION_MESSAGES,
  type ConfirmationOptions,
  type ConfirmationRequired,
} from "@/lib/account/confirmation";
import {
  type ConfirmResult,
  confirmWithCode as checkCode,
  confirmWithEmailCode as checkEmailCode,
  confirmWithPasskey as checkPasskey,
  currentSession,
  type EmailCodeResult,
  loadConfirmationOptions,
  requireRecentConfirmation,
  sendConfirmationCode as sendCode,
  startPasskeyConfirmation as startPasskey,
} from "@/lib/account/confirmation-server";
import { logError } from "@/lib/shared";

// "Confirm it's you" (lib/account/confirmation.ts): the dialog's server
// actions. Each answer is checked and counted on the server; a right one
// starts this session's 10 minutes.

/** The ways this account can confirm, and the masked address for codes. */
export async function getConfirmationOptions(): Promise<
  { ok: true; options: ConfirmationOptions } | { ok: false; error: string }
> {
  try {
    const session = await currentSession();
    if (!session) return { ok: false, error: CONFIRMATION_MESSAGES.signedOut };
    return { ok: true, options: await loadConfirmationOptions(session) };
  } catch (error) {
    logError(error as Error, { action: "account.getConfirmationOptions" });
    return { ok: false, error: CONFIRMATION_MESSAGES.failed };
  }
}

/**
 * Nothing but the check: before a flow with several steps (adding a passkey,
 * the turn-on stepper), so the dialog asks before the first one.
 */
export async function ensureConfirmed(): Promise<
  { ok: true } | ConfirmationRequired | { ok: false; error: string }
> {
  try {
    const session = await currentSession();
    if (!session) return { ok: false, error: CONFIRMATION_MESSAGES.signedOut };
    return (await requireRecentConfirmation(session)) ?? { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.ensureConfirmed" });
    return { ok: false, error: CONFIRMATION_MESSAGES.failed };
  }
}

export async function startPasskeyConfirmation(): Promise<
  { ok: true; options: Record<string, unknown> } | ConfirmResult
> {
  return startPasskey();
}

export async function confirmWithPasskey(
  input: unknown,
): Promise<ConfirmResult> {
  return checkPasskey(input);
}

export async function confirmWithCode(input: unknown): Promise<ConfirmResult> {
  return checkCode(input);
}

export async function sendConfirmationCode(): Promise<ConfirmResult> {
  return sendCode();
}

export async function confirmWithEmailCode(
  input: unknown,
): Promise<EmailCodeResult> {
  return checkEmailCode(input);
}
