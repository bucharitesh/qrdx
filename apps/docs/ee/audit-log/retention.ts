import "server-only";

import {
  database as db,
  organization,
  workspaceAuditLog,
} from "@repo/database";
import { and, eq, inArray, isNull, lt, type SQL } from "drizzle-orm";
import { after } from "next/server";
import { AUDIT_RETENTION_DAYS } from "@/ee/audit-log/limits";
import { isMissingTableError } from "@/ee/audit-log/missing-table";
import { logError } from "@/lib/log-error";

// How long the workspace audit log keeps rows, and the deletes that keep it
// to that: the daily cron (/api/cron/webhooks) purges rows older than 365
// days, and a deleted workspace's rows go after the deletion's response.
// Every delete works in bounded batches and stops at a deadline, so one call
// never holds a long lock or runs past the cron's time; what's left goes the
// next day.

export { AUDIT_RETENTION_DAYS } from "@/ee/audit-log/limits";
export const AUDIT_PURGE_BATCH = 1_000;
/** Batches of old rows per cron run (20,000 rows) at most. */
const MAX_PURGE_BATCHES = 20;
/** Batches of orphan rows per cron run (5,000 rows) at most. */
const MAX_ORPHAN_BATCHES = 5;
/** Orphans only once they're a day old: a workspace being made isn't one. */
const ORPHAN_MIN_AGE_MS = 86_400_000;
/** Batches when a workspace is deleted (the cron finishes the rest). */
const MAX_WORKSPACE_BATCHES = 50;
/** A purge without a deadline stops after this long. */
const DEFAULT_BUDGET_MS = 5_000;

/** Deletes up to `batch` rows matching `where`; returns how many went. */
async function deleteBatch(where: SQL, batch: number): Promise<number> {
  const ids = await db
    .select({ id: workspaceAuditLog.id })
    .from(workspaceAuditLog)
    .where(where)
    .limit(batch);
  if (ids.length === 0) return 0;
  await db.delete(workspaceAuditLog).where(
    inArray(
      workspaceAuditLog.id,
      ids.map((row) => row.id),
    ),
  );
  return ids.length;
}

/**
 * Rows of workspaces that no longer exist and are more than a day old: a
 * deleted workspace's rows go after its deletion
 * (scheduleWorkspaceAuditCleanup), and this catches any left behind. The age bound keeps the
 * anti-join on the created_at index instead of the whole table.
 */
async function orphanBatch(batch: number, before: Date): Promise<number> {
  const ids = await db
    .select({ id: workspaceAuditLog.id })
    .from(workspaceAuditLog)
    .leftJoin(
      organization,
      eq(organization.id, workspaceAuditLog.organizationId),
    )
    .where(
      and(lt(workspaceAuditLog.createdAt, before), isNull(organization.id)),
    )
    .limit(batch);
  if (ids.length === 0) return 0;
  await db.delete(workspaceAuditLog).where(
    inArray(
      workspaceAuditLog.id,
      ids.map((row) => row.id),
    ),
  );
  return ids.length;
}

/**
 * The daily purge: rows older than 365 days, then orphan rows, `batch` at a
 * time, until `deadline` (ms since the epoch). Returns how many rows went.
 * Never throws (the cron goes on with its other jobs).
 */
export async function purgeAuditEvents({
  now = new Date(),
  deadline = Date.now() + DEFAULT_BUDGET_MS,
  batch = AUDIT_PURGE_BATCH,
  maxBatches = MAX_PURGE_BATCHES,
  maxOrphanBatches = MAX_ORPHAN_BATCHES,
}: {
  now?: Date;
  deadline?: number;
  batch?: number;
  maxBatches?: number;
  maxOrphanBatches?: number;
} = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000);
  const orphanCutoff = new Date(now.getTime() - ORPHAN_MIN_AGE_MS);
  const timeLeft = () => Date.now() < deadline;
  let purged = 0;
  try {
    for (let round = 0; round < maxBatches && timeLeft(); round += 1) {
      const deleted = await deleteBatch(
        lt(workspaceAuditLog.createdAt, cutoff),
        batch,
      );
      purged += deleted;
      if (deleted < batch) break;
    }
    for (let round = 0; round < maxOrphanBatches && timeLeft(); round += 1) {
      const deleted = await orphanBatch(batch, orphanCutoff);
      purged += deleted;
      if (deleted < batch) break;
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      logError(error as Error, { action: "audit-log.purge", purged });
    }
  }
  return purged;
}

/**
 * Deletes the rows of a workspace that no longer exists (it does nothing
 * while the workspace is still there). Bounded; never throws: the daily
 * purge picks up anything left.
 */
export async function deleteWorkspaceAuditEvents(
  organizationId: string,
  { batch = AUDIT_PURGE_BATCH }: { batch?: number } = {},
): Promise<number> {
  let deleted = 0;
  try {
    const [still] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (still) return 0;
    for (let round = 0; round < MAX_WORKSPACE_BATCHES; round += 1) {
      const count = await deleteBatch(
        eq(workspaceAuditLog.organizationId, organizationId),
        batch,
      );
      deleted += count;
      if (count < batch) break;
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      logError(error as Error, {
        action: "audit-log.delete-workspace",
        organizationId,
      });
    }
  }
  return deleted;
}

/**
 * After a workspace is deleted: its rows go after the response, so the
 * deletion (a team, an account) never waits on them, and only if the
 * workspace is really gone. Returns at once and never throws.
 */
export function scheduleWorkspaceAuditCleanup(organizationId: string): void {
  const task = async () => {
    await deleteWorkspaceAuditEvents(organizationId);
  };
  try {
    after(task);
  } catch {
    // Outside a request (a script, a test): run it now, unawaited.
    void task();
  }
}
