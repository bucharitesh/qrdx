"use server";

import { revalidatePath } from "next/cache";
import { CONFIRMATION_MESSAGES } from "@/lib/account/confirmation";
import { confirmedSession } from "@/lib/account/confirmation-server";
import { cancelTwoFactorReset } from "@/lib/account/two-factor-reset-server";
import { logError } from "@/lib/shared";

/**
 * Cancels support's pending turn-off of this account's two-step verification
 * (lib/account/two-factor-reset-server.ts). It asks "Confirm it's you", which
 * with two-step verification on takes a passkey, an authenticator code or a
 * backup code: what someone who really lost them can't give. Confirming that
 * way cancels it on its own; this then finds nothing left and says it's done.
 */
export async function cancelSupportTwoFactorReset(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    const confirmed = await confirmedSession(CONFIRMATION_MESSAGES.signedOut);
    if (!confirmed.ok) return confirmed;
    const { session } = confirmed;
    await cancelTwoFactorReset(
      { id: session.userId, email: session.email },
      "person",
      { headers: session.requestHeaders },
    );
    revalidatePath("/settings/account");
    return { ok: true };
  } catch (error) {
    logError(error as Error, { action: "account.cancelTwoFactorReset" });
    return { ok: false, error: CONFIRMATION_MESSAGES.failed };
  }
}
