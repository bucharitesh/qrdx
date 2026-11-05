import "server-only";

import { auth } from "@repo/auth/server";
import {
  database as db,
  twoFactor,
  user as userTable,
  verification,
} from "@repo/database";
import { and, eq, like } from "drizzle-orm";

export interface TwoFactorStatus {
  on: boolean;
  /** Unused backup codes; null when they couldn't be read */
  backupCodesLeft: number | null;
}

/** Whether it's on, and how many backup codes are left (never the codes). */
export async function loadTwoFactorStatus(
  userId: string,
): Promise<TwoFactorStatus> {
  const [row] = await db
    .select({ on: userTable.twoFactorEnabled, verified: twoFactor.verified })
    .from(userTable)
    .leftJoin(twoFactor, eq(twoFactor.userId, userTable.id))
    .where(eq(userTable.id, userId))
    .limit(1);
  const on = Boolean(row?.on && row.verified !== false);
  if (!on) return { on: false, backupCodesLeft: null };
  try {
    const { backupCodes } = await auth.api.viewBackupCodes({
      body: { userId },
    });
    return { on, backupCodesLeft: backupCodes.length };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "account.two_factor_status_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return { on, backupCodesLeft: null };
  }
}

/**
 * Every device marked "don't ask again" stops being trusted. Better Auth
 * only forgets the browser that turned it off; this covers the rest, so
 * turning it on again later asks everywhere.
 */
export async function forgetTrustedDevices(userId: string): Promise<void> {
  await db
    .delete(verification)
    .where(
      and(
        like(verification.identifier, "trust-device-%"),
        eq(verification.value, userId),
      ),
    );
}

/**
 * Support's reset (admin panel): off, secret and backup codes deleted,
 * trusted devices forgotten. Sessions stay signed in.
 */
export async function resetTwoFactor(userId: string): Promise<void> {
  await db.delete(twoFactor).where(eq(twoFactor.userId, userId));
  await db
    .update(userTable)
    .set({ twoFactorEnabled: false, updatedAt: new Date() })
    .where(eq(userTable.id, userId));
  await forgetTrustedDevices(userId);
}
