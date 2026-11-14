import "server-only";

import { CONFIRMATION_REQUIRED } from "@/lib/account/confirmation";
import {
  currentSession,
  hasRecentStrongConfirmation,
} from "@/lib/account/confirmation-server";
import { twoFactorEnabledFor } from "@/lib/account/two-factor-server";
import { adminError } from "./action";

/**
 * The admin's own checks for a support action that hands an account over or
 * removes its protection, or records money sent: two-step verification on
 * their own account and a confirmation in the last 10 minutes with a
 * passkey, an authenticator code or a backup code (CONFIRMATION_REQUIRED
 * opens that dialog). A stolen admin cookie alone isn't enough.
 */
export async function requireStrongAdmin(admin: { id: string }): Promise<void> {
  if (!(await twoFactorEnabledFor(admin.id))) {
    throw adminError(
      "Turn on two-step verification for your own account first.",
    );
  }
  const adminSession = await currentSession();
  if (
    !(
      adminSession?.userId === admin.id &&
      (await hasRecentStrongConfirmation(adminSession))
    )
  ) {
    throw adminError(CONFIRMATION_REQUIRED, 403);
  }
}
