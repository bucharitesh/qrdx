"use server";

import {
  regenerateBackupCodes as regenerate,
  startTwoFactorSetup as start,
  type TwoFactorResult,
} from "@/lib/account/two-factor-manage";

// Settings → Profile & security → Two-step verification, the steps that
// don't swap the session. Confirming setup and turning it off go through
// app/api/account/two-factor/route.ts (see lib/account/two-factor-manage.ts).

/** A new secret for the authenticator app (needs a recent sign-in). */
export async function startTwoFactorSetup(): Promise<
  TwoFactorResult<{ totpUri: string; secret: string }>
> {
  return start();
}

/** New backup codes, confirmed with a current code. */
export async function regenerateBackupCodes(
  input: unknown,
): Promise<TwoFactorResult<{ backupCodes: string[] }>> {
  return regenerate(input);
}
