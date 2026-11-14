import "server-only";

import { database as db, fileAsset, landingPage } from "@repo/database";
import { eq, inArray } from "drizzle-orm";
import { writeAuditLog } from "@/app/(app)/admin/_lib/audit";
import type { AdminUser } from "@/app/(app)/admin/_lib/guard";
import { HttpError } from "@/lib/error-response";
import { logError } from "@/lib/log-error";
import {
  copyObject,
  deleteObject,
  headObject,
  isStorageConfigured,
} from "@/lib/storage/r2";
import { isQuarantineKey, quarantineKey, releasedKey } from "./keys";
import { fileIdsInContent } from "./references";
import { fileUrl } from "./service";
import type { FileStatus } from "./types";

/**
 * Takedowns (DMCA, abuse reports). A blocked file's object moves to an
 * unguessable quarantine key (lib/files/keys.ts), so its public storage URL
 * stops serving it at once; the copy is kept as evidence and for a restore.
 * /api/files/<id> answers 410 within a minute (its redirect is cached that
 * long), every page that uses it shows "file unavailable", and uploads with
 * the same SHA-256 are rejected. Unblocking moves the object back. Callers
 * must have checked admin access (app/admin/_lib/guard `assertAdmin`).
 */

export interface AdminFileView {
  id: string;
  filename: string;
  mime: string;
  size: number;
  status: FileStatus;
  url: string;
  userId: string;
  organizationId: string | null;
  createdAt: Date;
}

type FileRow = typeof fileAsset.$inferSelect;

const toAdminView = (row: FileRow): AdminFileView => ({
  id: row.id,
  filename: row.filename,
  mime: row.mime,
  size: row.size,
  status: row.status as FileStatus,
  url: fileUrl(row.id),
  userId: row.userId,
  organizationId: row.organizationId,
  createdAt: row.createdAt,
});

/** Files a landing page uses (any status), e.g. for a reported page. */
export async function listFilesForPage(
  pageId: string,
): Promise<AdminFileView[]> {
  const [page] = await db
    .select({ content: landingPage.content })
    .from(landingPage)
    .where(eq(landingPage.id, pageId))
    .limit(1);
  if (!page) return [];
  const ids = [...fileIdsInContent(page.content)];
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(fileAsset)
    .where(inArray(fileAsset.id, ids));
  return rows.map(toAdminView);
}

/**
 * Moves an object out of its public URL: copy to a fresh quarantine key,
 * then (after the row points there) delete the original. Returns the new
 * key, or null when nothing is stored at `key`.
 */
async function quarantine(key: string): Promise<string | null> {
  if (isQuarantineKey(key) || !(await headObject(key))) return null;
  const target = quarantineKey(key);
  await copyObject(key, target);
  return target;
}

/**
 * Blocks or restores one file and records it in the admin audit log.
 * `deleteContent` also deletes the stored object (irreversible): use it when
 * the content must be gone for good, not just unreachable.
 *
 * Blocking again is safe and also quarantines a blocked file whose object is
 * still at its public key (files blocked before quarantine existed).
 */
export async function setFileBlocked(
  admin: Pick<AdminUser, "id" | "email">,
  fileId: string,
  blocked: boolean,
  {
    reason,
    deleteContent = false,
  }: { reason?: string; deleteContent?: boolean } = {},
): Promise<AdminFileView> {
  const [row] = await db
    .select()
    .from(fileAsset)
    .where(eq(fileAsset.id, fileId))
    .limit(1);
  if (!row) throw new HttpError(404, "NOT_FOUND", "File not found.");

  const status: FileStatus = blocked ? "blocked" : "ready";
  const purge = blocked && deleteContent && isStorageConfigured;
  let storageKey = row.storageKey;
  /** Object to delete once the row no longer points at it */
  let leftover: string | null = null;

  if (blocked && !purge && isStorageConfigured) {
    const moved = await quarantine(row.storageKey);
    if (moved) {
      storageKey = moved;
      leftover = row.storageKey;
    }
  }

  if (!blocked && row.status === "blocked") {
    // Uploads rejected by the content checks have no object left to serve.
    const stored = isStorageConfigured
      ? await headObject(row.storageKey)
      : null;
    if (!stored) {
      throw new HttpError(
        409,
        "NOT_RESTORABLE",
        "The file's content is no longer stored, so it can't be restored.",
      );
    }
    if (isQuarantineKey(row.storageKey)) {
      storageKey = releasedKey(row.storageKey);
      await copyObject(row.storageKey, storageKey);
      leftover = row.storageKey;
    }
  }

  if (row.status === status && storageKey === row.storageKey && !purge) {
    return toAdminView(row);
  }

  const [updated] = await db
    .update(fileAsset)
    .set({ status, storageKey })
    .where(eq(fileAsset.id, fileId))
    .returning();
  await writeAuditLog({
    actor: admin,
    action: blocked ? "file.block" : "file.unblock",
    targetType: "file",
    targetId: fileId,
    metadata: {
      filename: row.filename,
      ownerUserId: row.userId,
      organizationId: row.organizationId,
      previousStatus: row.status,
      contentDeleted: purge,
      quarantined: blocked && isQuarantineKey(storageKey),
      ...(reason && { reason }),
    },
  });
  if (purge) await deleteObject(row.storageKey);
  if (leftover) {
    await deleteObject(leftover).catch((error) =>
      logError(error as Error, {
        action: blocked ? "files.quarantine" : "files.restore",
        id: fileId,
      }),
    );
  }
  return toAdminView(updated ?? { ...row, status, storageKey });
}

/** Blocks every file a reported page uses; returns the files touched. */
export async function blockFilesForPage(
  admin: Pick<AdminUser, "id" | "email">,
  pageId: string,
  options?: { reason?: string; deleteContent?: boolean },
): Promise<AdminFileView[]> {
  const files = await listFilesForPage(pageId);
  const results: AdminFileView[] = [];
  for (const file of files) {
    // Already-blocked files too: blocking is idempotent and quarantines any
    // object still at its public key.
    results.push(await setFileBlocked(admin, file.id, true, options));
  }
  return results;
}
