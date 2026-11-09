import "server-only";

import {
  database as db,
  organization,
  workspaceAuditLog,
} from "@repo/database";
import { eq, inArray, isNull, lt, type SQL } from "drizzle-orm";
import { after } from "next/server";
import { AUDIT_RETENTION_DAYS } from "@/ee/audit-log/limits";
import { isMissingTableError } from "@/ee/audit-log/missing-table";
import { logError } from "@/lib/log-error";

// How long the workspace audit log keeps rows, and the deletes that keep it
// to that: the daily cron (/api/cron/webhooks) purges rows older than 365
// days, and a deleted workspace's rows go after the deletion's response.
// Both work in bounded batches so one call never holds a long lock.

export { AUDIT_RETENTION_DAYS } from "@/ee/audit-log/limits";
export const AUDIT_PURGE_BATCH = 1_000;
/** Batches per cron run: 20,000 rows; anything left goes the next day. */
const MAX_PURGE_BATCHES = 20;
/** Batches when a workspace is deleted (the cron finishes the rest). */
const MAX_WORKSPACE_BATCHES = 50;

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
 * Rows of workspaces that no longer exist: deleting a workspace removes its
 * rows (deleteWorkspaceAuditEvents), and this catches any left behind.
 */
async function orphanBatch(batch: number): Promise<number> {
  const ids = await db
    .select({ id: workspaceAuditLog.id })
    .from(workspaceAuditLog)
    .leftJoin(
      organization,
      eq(organization.id, workspaceAuditLog.organizationId),
    )
    .where(isNull(organization.id))
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
 * The daily purge: rows older than 365 days, then rows of deleted
 * workspaces, `batch` at a time. Returns how many rows went. Never throws
 * (the cron goes on with its other jobs).
 */
export async function purgeAuditEvents({
  now = new Date(),
  batch = AUDIT_PURGE_BATCH,
  maxBatches = MAX_PURGE_BATCHES,
}: {
  now?: Date;
  batch?: number;
  maxBatches?: number;
} = {}): Promise<number> {
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 86_400_000);
  let purged = 0;
  try {
    for (let round = 0; round < maxBatches; round += 1) {
      const deleted = await deleteBatch(
        lt(workspaceAuditLog.createdAt, cutoff),
        batch,
      );
      purged += deleted;
      if (deleted < batch) break;
    }
    for (let round = 0; round < maxBatches; round += 1) {
      const deleted = await orphanBatch(batch);
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
