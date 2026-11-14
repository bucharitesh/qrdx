"use server";

import { dropPendingChallenge } from "./two-factor-challenge";

/**
 * "Use another account" during two-step verification: forget the pending
 * challenge, so the next sign-in starts over. Its record expires on its own.
 */
export async function cancelTwoFactorChallenge(): Promise<void> {
  await dropPendingChallenge();
}
