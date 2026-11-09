import "server-only";

import { randomUUID } from "node:crypto";
import {
  parseTwoFactorReset,
  TWO_FACTOR_RESET_PREFIX,
  type TwoFactorResetCancelledNotifier,
  type TwoFactorResetRecord,
  twoFactorResetDueAt,
  twoFactorResetIdentifier,
  twoFactorResetKeepUntil,
} from "@repo/auth/two-factor-reset";
import {
  database as db,
  user as userTable,
  verification,
} from "@repo/database";
import { eq, like } from "drizzle-orm";
import { writeAuditLog } from "@/app/admin/_lib/audit";
import type { TwoFactorResetCancelledBy } from "@/lib/email/templates/two-factor-notice";
import { sendTwoFactorNotice } from "./two-factor-notice-server";
import { resetTwoFactor } from "./two-factor-server";

// Support turning off someone's two-step verification waits 7 days with a
// notice to the account's address (packages/auth/two-factor-reset.ts has the
// rules and the record). Support schedules it on the admin user page
// (app/admin/users/support-actions.ts); the person can cancel it in Settings,
// by signing in with their second step, or by confirming it's them with it;
// support can cancel it too. The daily cron (app/api/cron/webhooks) completes
// the ones that are due: the same reset as before, signing out every session,
// and the "turned off by support" notice.

export interface PendingTwoFactorReset {
  dueAt: Date;
  requestedAt: Date;
  requestedBy: { id: string; email: string };
}

const toPending = (record: TwoFactorResetRecord): PendingTwoFactorReset => ({
  dueAt: new Date(record.dueAt),
  requestedAt: new Date(record.requestedAt),
  requestedBy: record.requestedBy,
});

const DUE_DATE = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeZone: "UTC",
});

/** "November 16, 2026": the UTC day the reset happens. */
export const formatTwoFactorResetDate = (date: Date) => DUE_DATE.format(date);

// No ids or addresses in these logs.
function log(level: "info" | "error", fields: Record<string, unknown>) {
  console[level](
    JSON.stringify({ event: "account.two_factor_reset", ...fields }),
  );
}

/** The account's pending reset, if support started one. */
export async function loadPendingTwoFactorReset(
  userId: string,
): Promise<PendingTwoFactorReset | null> {
  const [row] = await db
    .select({ value: verification.value })
    .from(verification)
    .where(eq(verification.identifier, twoFactorResetIdentifier(userId)))
    .limit(1);
  const record = row ? parseTwoFactorReset(row.value) : null;
  return record ? toPending(record) : null;
}

/**
 * Starts the wait (replacing an earlier pending reset of the account) and
 * returns it. The caller emails the notice.
 */
export async function scheduleTwoFactorReset({
  userId,
  admin,
  now = new Date(),
}: {
  userId: string;
  admin: { id: string; email: string };
  now?: Date;
}): Promise<PendingTwoFactorReset> {
  const dueAt = twoFactorResetDueAt(now);
  const record: TwoFactorResetRecord = {
    dueAt: dueAt.toISOString(),
    requestedAt: now.toISOString(),
    requestedBy: { id: admin.id, email: admin.email },
  };
  const identifier = twoFactorResetIdentifier(userId);
  await db.batch([
    db.delete(verification).where(eq(verification.identifier, identifier)),
    db.insert(verification).values({
      id: randomUUID(),
      identifier,
      value: JSON.stringify(record),
      expiresAt: twoFactorResetKeepUntil(dueAt),
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return toPending(record);
}

async function emailOf(userId: string): Promise<string | null> {
  const [found] = await db
    .select({ email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return found?.email ?? null;
}

/** Deletes the account's pending reset; returns it, or null when none. */
async function takePendingReset(
  userId: string,
): Promise<PendingTwoFactorReset | null> {
  const removed = await db
    .delete(verification)
    .where(eq(verification.identifier, twoFactorResetIdentifier(userId)))
    .returning({ value: verification.value });
  if (removed.length === 0) return null;
  const record = parseTwoFactorReset(removed[0].value);
  // Ours but unreadable: still gone, with nothing to report.
  return record ? toPending(record) : null;
}

/** Emails the account that the reset is coming, with its day. */
export function notifyTwoFactorResetScheduled(
  email: string,
  pending: Pick<PendingTwoFactorReset, "dueAt">,
): Promise<void> {
  return sendTwoFactorNotice("support-reset-scheduled", email, {
    extra: { dueDate: formatTwoFactorResetDate(pending.dueAt) },
  });
}

/**
 * Cancels the account's pending reset, if there is one: deleted, the
 * account's address told, and (unless support cancelled it, which support's
 * action audits itself) an audit entry with the person as its actor.
 * Returns whether one was pending.
 */
export async function cancelTwoFactorReset(
  who: { id: string; email?: string },
  by: TwoFactorResetCancelledBy,
  { headers }: { headers?: Headers } = {},
): Promise<boolean> {
  const pending = await takePendingReset(who.id);
  if (!pending) return false;
  log("info", { outcome: "cancelled", by });
  const email = who.email ?? (await emailOf(who.id));
  if (!email) {
    log("error", { outcome: "no-email" });
    return true;
  }
  const person = { id: who.id, email };
  await sendTwoFactorNotice("support-reset-cancelled", person.email, {
    extra: { cancelledBy: by },
    headers,
  });
  if (by !== "support") {
    try {
      await writeAuditLog({
        actor: person,
        action: "user.reset_two_factor_cancel",
        targetType: "user",
        targetId: person.id,
        metadata: {
          by,
          subjectUserId: person.id,
          targetEmail: person.email,
          requestedBy: pending.requestedBy.email,
          dueAt: pending.dueAt.toISOString(),
        },
      });
    } catch (error) {
      log("error", {
        outcome: "audit-failed",
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
  }
  return true;
}

/**
 * Best effort, for when the person showed they still have their second step
 * (confirming it's them with it): never throws, never holds up what it was
 * for.
 */
export async function cancelTwoFactorResetQuietly(
  person: { id: string; email?: string },
  options: { headers?: Headers } = {},
): Promise<void> {
  try {
    await cancelTwoFactorReset(person, "person", options);
  } catch (error) {
    log("error", {
      outcome: "cancel-failed",
      error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  }
}

/**
 * Registered with @repo/auth in app/api/auth/[...all]/route.ts: a sign-in
 * that answered the second step cancelled a pending reset (Better Auth
 * already deleted the row). Emails the account and audits it.
 */
export const notifyTwoFactorResetCancelled: TwoFactorResetCancelledNotifier =
  async ({ user, record, headers }) => {
    await sendTwoFactorNotice("support-reset-cancelled", user.email, {
      extra: { cancelledBy: "sign-in" },
      headers,
    });
    await writeAuditLog({
      actor: user,
      action: "user.reset_two_factor_cancel",
      targetType: "user",
      targetId: user.id,
      metadata: {
        by: "sign-in",
        subjectUserId: user.id,
        targetEmail: user.email,
        requestedBy: record?.requestedBy.email ?? null,
        dueAt: record?.dueAt ?? null,
      },
    });
  };

export interface DueResetsSummary {
  completed: number;
  /** Already off, the account gone, or a row we couldn't read */
  dropped: number;
  failed: number;
}

/**
 * The daily cron: completes every reset that's due. Each one is taken out
 * first (a reset cancelled meanwhile is skipped), then two-step verification
 * goes off with every session signed out (resetTwoFactor), the address gets
 * the "turned off by support" notice and the audit log an entry by the admin
 * who started it. A reset that fails is put back for the next day.
 */
export async function completeDueTwoFactorResets(
  now: Date = new Date(),
): Promise<DueResetsSummary> {
  const summary: DueResetsSummary = { completed: 0, dropped: 0, failed: 0 };
  const rows = await db
    .select({
      identifier: verification.identifier,
      value: verification.value,
      expiresAt: verification.expiresAt,
    })
    .from(verification)
    .where(like(verification.identifier, `${TWO_FACTOR_RESET_PREFIX}%`));

  for (const row of rows) {
    const userId = row.identifier.slice(TWO_FACTOR_RESET_PREFIX.length);
    const record = parseTwoFactorReset(row.value);
    if (record && new Date(record.dueAt).getTime() > now.getTime()) continue;

    const pending = await takePendingReset(userId);
    if (!pending) {
      // Cancelled since the list was read, or unreadable (now deleted).
      if (!record) summary.dropped += 1;
      continue;
    }
    try {
      const [account] = await db
        .select({ email: userTable.email, on: userTable.twoFactorEnabled })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);
      if (!account?.on) {
        summary.dropped += 1;
        continue;
      }
      await resetTwoFactor(userId, { signOutEverywhere: true });
      summary.completed += 1;
      await sendTwoFactorNotice("support-off", account.email);
      await writeAuditLog({
        actor: pending.requestedBy,
        action: "user.reset_two_factor_complete",
        targetType: "user",
        targetId: userId,
        metadata: {
          subjectUserId: userId,
          targetEmail: account.email,
          requestedAt: pending.requestedAt.toISOString(),
          dueAt: pending.dueAt.toISOString(),
        },
      }).catch((error: unknown) => {
        log("error", {
          outcome: "audit-failed",
          error:
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
        });
      });
    } catch (error) {
      summary.failed += 1;
      log("error", {
        outcome: "complete-failed",
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
      // Back for tomorrow's run.
      try {
        await db.insert(verification).values({
          id: randomUUID(),
          identifier: row.identifier,
          value: row.value,
          expiresAt: row.expiresAt,
          createdAt: now,
          updatedAt: now,
        });
      } catch {
        log("error", { outcome: "requeue-failed" });
      }
    }
  }
  if (summary.completed + summary.dropped + summary.failed > 0) {
    log(summary.failed > 0 ? "error" : "info", {
      outcome: "due-run",
      ...summary,
    });
  }
  return summary;
}
