import "server-only";

import { DATA_OUT_PROVIDERS } from "@repo/auth/unproven-access";
import {
  type ConfirmationRequired,
  confirmationRequired,
} from "@/lib/account/confirmation";
import {
  currentSession,
  requireRecentConfirmation,
} from "@/lib/account/confirmation-server";

// Connecting a tool that QRdx sends the account's data to asks "Confirm it's
// you" first (lib/account/confirmation.ts), as pasting a Slack or Discord
// webhook in Settings → Notifications does: a stolen session cookie alone
// mustn't be able to send scans or form answers to an account elsewhere.
// These are DATA_OUT_PROVIDERS: Slack (each channel becomes an alert target
// for form answers and scan milestones) and the data-out syncs.
//
// The check is where the provider's sign-in starts ("Add to Slack", Enable
// and Reconnect, and GET /api/integrations/<provider>?action=connect). Those
// set the flow's state cookie, without which the callback refuses, so the
// callback never runs for a flow that didn't pass here, and a confirmation
// needn't outlast the time spent at the provider.

const SENDS_DATA_OUT: ReadonlySet<string> = new Set(DATA_OUT_PROVIDERS);

/** Connecting this provider sends the account's data out. */
export function connectSendsDataOut(provider: string): boolean {
  return SENDS_DATA_OUT.has(provider);
}

/**
 * Before starting `provider`'s sign-in for `userId`: CONFIRMATION_REQUIRED
 * when it sends data out and this session (it must be `userId`'s) hasn't
 * confirmed in the last 10 minutes, else null.
 */
export async function connectConfirmationNeeded(
  provider: string,
  userId: string,
): Promise<ConfirmationRequired | null> {
  if (!connectSendsDataOut(provider)) return null;
  const session = await currentSession();
  if (session?.userId !== userId) return confirmationRequired();
  return requireRecentConfirmation(session);
}
