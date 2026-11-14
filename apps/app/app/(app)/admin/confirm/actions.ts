"use server";

import { z } from "zod";
import { runAdminAction } from "../_lib/action";
import { requireStrongAdmin } from "../_lib/strong-admin";

/**
 * The strong-admin check alone, for /admin/confirm: two-step verification
 * on, and a confirmation with a passkey, an authenticator code or a backup
 * code in the last 10 minutes. CONFIRMATION_REQUIRED opens the dialog.
 * Changes nothing, so it writes no audit entry.
 */
export async function checkStrongConfirmationAction(input: unknown = {}) {
  return runAdminAction(
    { action: "admin.confirm", schema: z.object({}), revalidate: [] },
    input,
    async (admin) => {
      await requireStrongAdmin(admin);
      return null;
    },
  );
}
