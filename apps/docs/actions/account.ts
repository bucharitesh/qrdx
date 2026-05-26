"use server";

import { database as db, subscription, user as userTable } from "@repo/database";
import { eq } from "drizzle-orm";
import { polar } from "@/lib/polar";
import { getCurrentUserId, logError } from "@/lib/shared";
import {
  actionError,
  actionSuccess,
  ErrorCode,
  type ActionResult,
} from "@/types/errors";

export async function deleteAccount(): Promise<ActionResult<boolean>> {
  try {
    const userId = await getCurrentUserId();

    try {
      await polar.customers.deleteExternal({ externalId: userId });
    } catch (_e) {
      // Expected for free users — no Polar customer exists
    }

    await db.delete(subscription).where(eq(subscription.userId, userId));

    await db.delete(userTable).where(eq(userTable.id, userId));

    return actionSuccess(true);
  } catch (error) {
    logError(error as Error, { action: "deleteAccount" });
    return actionError(
      ErrorCode.UNKNOWN_ERROR,
      "Failed to delete account. Please try again.",
    );
  }
}
