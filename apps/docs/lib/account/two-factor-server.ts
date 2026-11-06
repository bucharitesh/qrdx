import "server-only";

import { auth } from "@repo/auth/server";
import {
  LOCKOUT_FAILURES,
  LOCKOUT_MINUTES,
} from "@repo/auth/sign-in-challenge-rules";
import {
  database as db,
  twoFactor,
  user as userTable,
  verification,
} from "@repo/database";
import { and, eq, isNull, like, lte, or, sql } from "drizzle-orm";

export interface TwoFactorStatus {
  on: boolean;
  /** Unused backup codes; null when they couldn't be read */
  backupCodesLeft: number | null;
}

/**
 * Whether two-step verification is on, read from the database. Checks that
 * decide whether a code is needed use this, never `session.user`, so they
 * stay right even if a session is ever served from a cookie cache.
 */
export async function twoFactorEnabledFor(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ on: userTable.twoFactorEnabled })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return row?.on === true;
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
 * trusted devices forgotten. Sessions stay signed in. One transaction, and
 * the switch goes off first: a half-done reset never leaves 2FA on with no
 * secret to answer it.
 */
export async function resetTwoFactor(userId: string): Promise<void> {
  await db.batch([
    db
      .update(userTable)
      .set({ twoFactorEnabled: false, updatedAt: new Date() })
      .where(eq(userTable.id, userId)),
    db.delete(twoFactor).where(eq(twoFactor.userId, userId)),
    db
      .delete(verification)
      .where(
        and(
          like(verification.identifier, "trust-device-%"),
          eq(verification.value, userId),
        ),
      ),
  ]);
}

export type CodeAttempt =
  | { ok: true; id: string; attempts: number }
  | { ok: false; reason: "off" | "locked" };

/**
 * Counts one attempt at a current authenticator or backup code BEFORE it's
 * checked, in a single statement that refuses while the account's codes are
 * locked. Concurrent attempts queue on the row, so no more than
 * LOCKOUT_FAILURES get through before the lock, with or without Redis. The
 * attempt that reaches the limit sets the lock; a right code then clears it
 * (checkCurrentCode). An expired lock starts the count again from 1.
 */
export async function reserveCodeAttempt(userId: string): Promise<CodeAttempt> {
  const expired = sql`(${twoFactor.lockedUntil} is not null and ${twoFactor.lockedUntil} <= now())`;
  const next = sql`(case when ${expired} then 1 else coalesce(${twoFactor.failedVerificationCount}, 0) + 1 end)`;
  const [row] = await db
    .update(twoFactor)
    .set({
      failedVerificationCount: next,
      lockedUntil: sql`(case when ${next} >= ${LOCKOUT_FAILURES}::int then now() + ${LOCKOUT_MINUTES}::int * interval '1 minute' else null end)`,
    })
    .where(
      and(
        eq(twoFactor.userId, userId),
        or(
          isNull(twoFactor.lockedUntil),
          lte(twoFactor.lockedUntil, sql`now()`),
        ),
      ),
    )
    .returning({
      id: twoFactor.id,
      attempts: twoFactor.failedVerificationCount,
    });
  if (row) return { ok: true, id: row.id, attempts: row.attempts ?? 0 };
  const [exists] = await db
    .select({ id: twoFactor.id })
    .from(twoFactor)
    .where(eq(twoFactor.userId, userId))
    .limit(1);
  return { ok: false, reason: exists ? "locked" : "off" };
}
