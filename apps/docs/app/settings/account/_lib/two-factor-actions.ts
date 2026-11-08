"use server";

import {
  existingPasskeyOptions as existingOptions,
  regenerateBackupCodes as regenerate,
  removeAuthenticatorApp as removeApp,
  startAuthenticatorSetup as start,
  type TurnedOn,
  type TwoFactorResult,
  turnOffTwoFactor as turnOff,
  turnOnWithExistingPasskey as turnOnWithExisting,
} from "@/lib/account/two-factor-manage";

// Settings → Profile & security → Two-step verification, the steps that
// keep the session. Each needs a recent "Confirm it's you" and answers
// CONFIRMATION_REQUIRED without one. Confirming an authenticator app goes
// through app/api/account/two-factor/route.ts (see
// lib/account/two-factor-manage.ts).

/** A new secret for the authenticator app. */
export async function startAuthenticatorSetup(): Promise<
  TwoFactorResult<{ totpUri: string; secret: string }>
> {
  return start();
}

/** Removes the authenticator app (the last method turns it off). */
export async function removeAuthenticatorApp(): Promise<
  TwoFactorResult<{ turnedOff: boolean }>
> {
  return removeApp();
}

/** New backup codes. */
export async function regenerateBackupCodes(): Promise<
  TwoFactorResult<{ backupCodes: string[] }>
> {
  return regenerate();
}

/** Turns two-step verification off. */
export async function turnOffTwoFactor(): Promise<TwoFactorResult> {
  return turnOff();
}

/** "Your passkey is ready": the prompt's options for an existing passkey. */
export async function existingPasskeyOptions(): Promise<
  TwoFactorResult<{ options: Record<string, unknown> }>
> {
  return existingOptions();
}

/**
 * Then the passkey's answer turns it on (signing out the account's other
 * sessions); returns the backup codes.
 */
export async function turnOnWithExistingPasskey(
  input: unknown,
): Promise<TwoFactorResult<TurnedOn>> {
  return turnOnWithExisting(input);
}
