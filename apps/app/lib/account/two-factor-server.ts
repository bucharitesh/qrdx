import "server-only";

import { isPasskeyOrigin, passkeyRelyingParty } from "@repo/auth/passkey-rp";
import { auth } from "@repo/auth/server";
import {
  LOCKOUT_FAILURES,
  LOCKOUT_MINUTES,
} from "@repo/auth/sign-in-challenge-rules";
import {
  database as db,
  passkey,
  session as sessionTable,
  twoFactor,
  user as userTable,
  verification,
} from "@repo/database";
import { and, count, eq, isNull, like, lte, ne, or, sql } from "drizzle-orm";
import { requestOrigin } from "@/app/(app)/settings/developers/_lib/origin";
import { env } from "@/env";
import { isFeatureAvailable } from "@/lib/feature-availability";
import {
  hasAuthenticatorApp,
  type TwoFactorMethods,
  type TwoFactorRowFacts,
} from "./two-factor-methods";

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

/** The switch, the account's `two_factor` row and how many passkeys it has. */
export async function loadTwoFactorFacts(userId: string): Promise<{
  on: boolean;
  row: (TwoFactorRowFacts & { id: string }) | null;
  passkeys: number;
}> {
  const [[found], [counted]] = await Promise.all([
    db
      .select({
        on: userTable.twoFactorEnabled,
        id: twoFactor.id,
        verified: twoFactor.verified,
        secret: twoFactor.secret,
      })
      .from(userTable)
      .leftJoin(twoFactor, eq(twoFactor.userId, userTable.id))
      .where(eq(userTable.id, userId))
      .limit(1),
    db
      .select({ value: count() })
      .from(passkey)
      .where(eq(passkey.userId, userId)),
  ]);
  return {
    on: found?.on === true,
    row:
      found?.id && found.secret !== null
        ? { id: found.id, verified: found.verified, secret: found.secret }
        : null,
    passkeys: counted?.value ?? 0,
  };
}

/**
 * The methods Settings shows: the switch, the authenticator app, passkeys
 * and how many backup codes are left (never the codes).
 */
export async function loadTwoFactorMethods(
  userId: string,
): Promise<TwoFactorMethods> {
  const facts = await loadTwoFactorFacts(userId);
  const methods: TwoFactorMethods = {
    on: facts.on,
    authenticatorApp: facts.on && hasAuthenticatorApp(facts.row),
    passkeys: facts.passkeys,
    backupCodesLeft: null,
  };
  if (!(facts.on && facts.row)) return methods;
  try {
    return { ...methods, backupCodesLeft: await countBackupCodes(userId) };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "account.two_factor_status_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return methods;
  }
}

// Never matches the relying party: a request without a usable host.
const NO_ORIGIN = new URL("https://unknown.invalid");

/**
 * Passkeys work on the page this request came from: the deployment's URL can
 * carry them and the page is on that origin (not a preview URL), since a
 * passkey only works on the origin it belongs to.
 */
export function passkeysWorkHere(requestHeaders: Headers): boolean {
  if (!isFeatureAvailable("passkeys")) return false;
  const relyingParty = passkeyRelyingParty({
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL,
  });
  return isPasskeyOrigin(
    relyingParty,
    requestOrigin(requestHeaders, NO_ORIGIN),
  );
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
 * Turning it off, by the person (Settings, ./two-factor-manage.ts) or by
 * support (admin panel): off, secret and backup codes deleted, trusted
 * devices forgotten. Passkeys stay (they still sign in on their own).
 * Sessions stay signed in, unless `signOutEverywhere` (support's reset:
 * every session of the account ends, in the same transaction). One
 * transaction, and the switch goes off first: a half-done reset never leaves
 * 2FA on with nothing to answer it.
 */
export async function resetTwoFactor(
  userId: string,
  { signOutEverywhere = false }: { signOutEverywhere?: boolean } = {},
): Promise<void> {
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
    ...(signOutEverywhere
      ? [db.delete(sessionTable).where(eq(sessionTable.userId, userId))]
      : []),
  ]);
}

/** How many backup codes the account has left (never the codes). */
export async function countBackupCodes(userId: string): Promise<number> {
  const { backupCodes } = await auth.api.viewBackupCodes({
    body: { userId },
  });
  return backupCodes.length;
}

/**
 * Two-step verification just turned on: every other session of the account
 * is signed out, so a browser that got in without the second step (a stolen
 * cookie, someone else reading the mailbox) has to sign in again and answer
 * it. `keep` is the session the person is using: by id, or by token right
 * after Better Auth swapped it for a new one (its "Confirm it's you" moved
 * with it, ./confirmation-server.tsx carryConfirmation). Returns how many
 * were signed out.
 */
export async function signOutOtherSessions(
  userId: string,
  keep: { sessionId: string } | { token: string },
): Promise<number> {
  const removed = await db
    .delete(sessionTable)
    .where(
      and(
        eq(sessionTable.userId, userId),
        "token" in keep
          ? ne(sessionTable.token, keep.token)
          : ne(sessionTable.id, keep.sessionId),
      ),
    )
    .returning({ id: sessionTable.id });
  return removed.length;
}

export type CodeAttempt =
  | { ok: true; id: string; attempts: number }
  | { ok: false; reason: "off" | "locked" };

/**
 * Counts one attempt at confirming with a passkey, an authenticator code or
 * a backup code BEFORE it's checked, in a single statement that refuses
 * while the account is locked. Concurrent attempts queue on the row, so no
 * more than LOCKOUT_FAILURES get through before the lock, with or without
 * Redis. The attempt that reaches the limit sets the lock; a right answer
 * then clears it (clearCodeFailures). An expired lock starts the count again
 * from 1.
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

/**
 * Takes back one attempt reserveCodeAttempt counted, for a check that never
 * got to judge the answer (it failed for another reason, such as the
 * database, or a rule refusing the passkey plugin's throwaway session): as
 * if it hadn't been made, so it doesn't count toward the lockout. A lock that
 * attempt set goes with it. Unlike clearCodeFailures, earlier wrong answers
 * still count.
 */
export async function releaseCodeAttempt(rowId: string): Promise<void> {
  const before = sql`coalesce(${twoFactor.failedVerificationCount}, 0)`;
  await db
    .update(twoFactor)
    .set({
      failedVerificationCount: sql`greatest(${before} - 1, 0)`,
      lockedUntil: sql`(case when ${before} - 1 >= ${LOCKOUT_FAILURES}::int then ${twoFactor.lockedUntil} else null end)`,
    })
    .where(eq(twoFactor.id, rowId));
}

/** A right answer: the count of wrong ones in a row starts again. */
export async function clearCodeFailures(rowId: string): Promise<void> {
  await db
    .update(twoFactor)
    .set({ failedVerificationCount: 0, lockedUntil: null })
    .where(eq(twoFactor.id, rowId));
}
