import "server-only";

import { database as db, fileAsset, landingPage } from "@repo/database";
import { eq, inArray } from "drizzle-orm";
import { writeAuditLog } from "@/app/admin/_lib/audit";
import type { AdminUser } from "@/app/admin/_lib/guard";
import { HttpError } from "@/lib/error-response";
import {
  deleteObject,
  headObject,
  isStorageConfigured,
} from "@/lib/storage/r2";
import { fileIdsInContent } from "./references";
import { fileUrl } from "./service";
import type { FileStatus } from "./types";

/**
 * Takedowns (DMCA, abuse reports). A blocked file keeps its stored object
 * (evidence, possible restore) but /api/files/<id> stops serving it within a
 * minute, every page that uses it shows "file unavailable", and uploads with
 * the same SHA-256 are rejected. Callers must have checked admin access
 * (app/admin/_lib/guard `assertAdmin`).
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
 * Blocks or restores one file and records it in the admin audit log.
 * `deleteContent` also deletes the stored object (irreversible): use it when
 * the content must be gone, e.g. a public bucket URL someone already has.
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
  }

  const status: FileStatus = blocked ? "blocked" : "ready";
  const purge = blocked && deleteContent && isStorageConfigured;
  if (row.status === status && !purge) return toAdminView(row);

  const [updated] = await db
    .update(fileAsset)
    .set({ status })
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
      ...(reason && { reason }),
    },
  });
  if (purge) await deleteObject(row.storageKey);
  return toAdminView(updated ?? { ...row, status });
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
    results.push(
      file.status === "blocked" && !options?.deleteContent
        ? file
        : await setFileBlocked(admin, file.id, true, options),
    );
  }
  return results;
}
