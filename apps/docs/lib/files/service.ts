import "server-only";

import { database as db, fileAsset, landingPage, qrCode } from "@repo/database";
import cuid from "cuid";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  like,
  lt,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { getPlanForScope, getPlanLimits, type Plan } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import type { ActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import {
  deleteObject,
  isStorageConfigured,
  type PresignedUpload,
  presignUpload,
} from "@/lib/storage/r2";
import { checkUpload } from "./quota";
import { fileIdsInContent, fileIdsInLink } from "./references";
import {
  type AllowedMime,
  displayFilename,
  FILE_ID_PATTERN,
  FILE_KIND_LABELS,
  type FileKind,
  type FileView,
  filePath,
  formatsForKinds,
  isAllowedMime,
  kindForMime,
  mimesForKind,
  normalizeMime,
  storageFilename,
} from "./types";
import { verifyStoredObject } from "./verify";

/**
 * Uploaded files (file_asset) for hosted pages, per personal or team
 * workspace. Browsers upload straight to R2 with a presigned PUT:
 *
 *   createUpload  → pending row + presigned PUT (type, size, plan checked)
 *   (browser PUT)
 *   finalizeUpload → object checked (size, type, magic bytes) → ready | blocked
 *
 * Files are served from a stable link (/api/files/<id>), so "Replace file"
 * swaps the stored object without touching the pages that use it, and a
 * blocked file disappears everywhere at once.
 */

/** Pending uploads older than this are abandoned (presigned PUTs last 10 min). */
const STALE_PENDING_MS = 2 * 60 * 60 * 1000;
const LIST_LIMIT = 500;
const PICKER_LIMIT = 200;
const CLEANUP_BATCH = 20;

export const fileIdSchema = z
  .string()
  .regex(FILE_ID_PATTERN, "Invalid file id");

export const createUploadSchema = z.object({
  filename: z.string().trim().min(1, "File name is required").max(1024),
  /** Browser-reported type; may be empty (then the extension decides) */
  mime: z.string().trim().max(255).default(""),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  /** Replace this file's content, keeping its link */
  replaceId: fileIdSchema.optional(),
});

export const finalizeUploadSchema = z.object({
  replaceId: fileIdSchema.optional(),
});

export type CreateUploadInput = z.infer<typeof createUploadSchema>;

type FileRow = typeof fileAsset.$inferSelect;

export function fileUrl(id: string, options?: { download?: boolean }) {
  return new URL(filePath(id, options), baseUrl).toString();
}

function kindOf(row: Pick<FileRow, "mime">): FileKind | null {
  return isAllowedMime(row.mime) ? kindForMime(row.mime) : null;
}

function toView(row: FileRow, scope: ActiveScope): FileView {
  const mime = (
    isAllowedMime(row.mime) ? row.mime : "application/pdf"
  ) as AllowedMime;
  return {
    id: row.id,
    filename: row.filename,
    mime,
    kind: kindForMime(mime),
    size: row.size,
    status:
      row.status === "ready" || row.status === "blocked"
        ? row.status
        : "pending",
    createdAt: row.createdAt.toISOString(),
    url: fileUrl(row.id),
    mine: row.userId === scope.userId,
  };
}

// ─── Scope, permissions, availability ────────────────────────────────────────

function scopeWhere(scope: ActiveScope): SQL {
  return scope.organizationId
    ? eq(fileAsset.organizationId, scope.organizationId)
    : (and(
        eq(fileAsset.userId, scope.userId),
        isNull(fileAsset.organizationId),
      ) as SQL);
}

/** Key prefix of a workspace: `u-<userId>` or `o-<organizationId>`. */
function scopeSegment(scope: ActiveScope): string {
  return scope.organizationId
    ? `o-${scope.organizationId}`
    : `u-${scope.userId}`;
}

/** Team members manage their own uploads; owners and admins every team file. */
export function canManageFile(
  scope: ActiveScope,
  row: Pick<FileRow, "userId">,
): boolean {
  return !(
    scope.organizationId &&
    scope.role === "member" &&
    row.userId !== scope.userId
  );
}

export function assertStorageConfigured(): void {
  if (!isStorageConfigured) {
    throw new HttpError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "Storage not configured on this server.",
    );
  }
}

const notFound = () => new HttpError(404, "NOT_FOUND", "File not found.");

async function findRow(scope: ActiveScope, id: string): Promise<FileRow> {
  if (!FILE_ID_PATTERN.test(id)) throw notFound();
  const [row] = await db
    .select()
    .from(fileAsset)
    .where(and(eq(fileAsset.id, id), scopeWhere(scope)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

function assertCanManage(scope: ActiveScope, row: FileRow) {
  if (!canManageFile(scope, row)) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only team owners and admins can change files uploaded by others.",
    );
  }
}

async function scopeLimits(scope: ActiveScope) {
  const plan = await getPlanForScope(scope);
  const limits = getPlanLimits(plan);
  return {
    plan,
    planName: PLAN_NAMES[plan],
    storageBytes: limits.storageBytes,
    maxFileBytes: limits.maxFileBytes,
  };
}

const recentPending = () =>
  and(
    eq(fileAsset.status, "pending"),
    gt(fileAsset.createdAt, new Date(Date.now() - STALE_PENDING_MS)),
  );

/**
 * Bytes counted against the quota: ready files plus uploads in progress.
 * Blocked files don't count: rejected uploads are deleted from storage, and a
 * takedown shouldn't cost the owner space.
 */
async function usedBytes(
  scope: ActiveScope,
  {
    includePending = true,
    excludeId,
  }: { includePending?: boolean; excludeId?: string } = {},
): Promise<number> {
  const counted = includePending
    ? or(eq(fileAsset.status, "ready"), recentPending())
    : eq(fileAsset.status, "ready");
  const [row] = await db
    .select({
      used: sql<string | number | null>`coalesce(sum(${fileAsset.size}), 0)`,
    })
    .from(fileAsset)
    .where(
      and(
        scopeWhere(scope),
        counted,
        excludeId ? ne(fileAsset.id, excludeId) : undefined,
      ),
    );
  return Number(row?.used ?? 0);
}

/** Best effort: drops abandoned uploads (row + any partial object). */
async function cleanupStalePending(scope: ActiveScope): Promise<void> {
  try {
    const stale = await db
      .select({ id: fileAsset.id, storageKey: fileAsset.storageKey })
      .from(fileAsset)
      .where(
        and(
          scopeWhere(scope),
          eq(fileAsset.status, "pending"),
          lt(fileAsset.createdAt, new Date(Date.now() - STALE_PENDING_MS)),
        ),
      )
      .limit(CLEANUP_BATCH);
    if (stale.length === 0) return;
    await Promise.all(stale.map((row) => deleteObject(row.storageKey)));
    await db.delete(fileAsset).where(
      and(
        inArray(
          fileAsset.id,
          stale.map((row) => row.id),
        ),
        eq(fileAsset.status, "pending"),
      ),
    );
  } catch (error) {
    logError(error as Error, { action: "files.cleanupStalePending" });
  }
}

/** Removes a rejected object; the row stays as "blocked" for the record. */
async function rejectUpload(row: FileRow): Promise<void> {
  await db
    .update(fileAsset)
    .set({ status: "blocked" })
    .where(eq(fileAsset.id, row.id));
  await deleteObject(row.storageKey).catch((error) =>
    logError(error as Error, { action: "files.rejectUpload", id: row.id }),
  );
}

async function discardUpload(row: FileRow): Promise<void> {
  await db.delete(fileAsset).where(eq(fileAsset.id, row.id));
  await deleteObject(row.storageKey).catch((error) =>
    logError(error as Error, { action: "files.discardUpload", id: row.id }),
  );
}

// ─── Overview + listing ──────────────────────────────────────────────────────

export interface StorageOverview {
  configured: boolean;
  plan: Plan;
  planName: string;
  usedBytes: number;
  /** null = unlimited */
  storageBytes: number | null;
  maxFileBytes: number;
}

export async function getStorageOverview(
  scope: ActiveScope,
): Promise<StorageOverview> {
  const limits = await scopeLimits(scope);
  const used = isStorageConfigured ? await usedBytes(scope) : 0;
  return {
    configured: isStorageConfigured,
    plan: limits.plan,
    planName: limits.planName,
    usedBytes: used,
    storageBytes: Number.isFinite(limits.storageBytes)
      ? limits.storageBytes
      : null,
    maxFileBytes: limits.maxFileBytes,
  };
}

/** Ready and blocked files of the workspace, newest first. */
export async function listFiles(
  scope: ActiveScope,
  {
    kind,
    readyOnly = false,
    limit = LIST_LIMIT,
  }: { kind?: FileKind; readyOnly?: boolean; limit?: number } = {},
): Promise<FileView[]> {
  const rows = await db
    .select()
    .from(fileAsset)
    .where(
      and(
        scopeWhere(scope),
        readyOnly
          ? eq(fileAsset.status, "ready")
          : inArray(fileAsset.status, ["ready", "blocked"]),
        kind ? inArray(fileAsset.mime, mimesForKind(kind)) : undefined,
      ),
    )
    .orderBy(desc(fileAsset.createdAt))
    .limit(Math.min(limit, LIST_LIMIT));
  return rows.map((row) => toView(row, scope));
}

/** Ready files for the page editor's picker. */
export function listPickerFiles(scope: ActiveScope, kind?: FileKind) {
  return listFiles(scope, { kind, readyOnly: true, limit: PICKER_LIMIT });
}

export interface FileUsage {
  /** Hosted pages whose content uses the file */
  pages: { id: string; title: string | null }[];
  /** Dynamic codes that redirect straight to the file's link */
  codeCount: number;
}

function pageScopeWhere(scope: ActiveScope): SQL {
  return scope.organizationId
    ? eq(landingPage.organizationId, scope.organizationId)
    : (and(
        eq(landingPage.userId, scope.userId),
        isNull(landingPage.organizationId),
      ) as SQL);
}

function codeScopeWhere(scope: ActiveScope): SQL {
  return scope.organizationId
    ? eq(qrCode.organizationId, scope.organizationId)
    : (and(
        eq(qrCode.userId, scope.userId),
        isNull(qrCode.organizationId),
      ) as SQL);
}

/** Where each file is used inside the workspace ("used by N pages"). */
export async function getFileUsage(
  scope: ActiveScope,
  fileIds: readonly string[],
): Promise<Map<string, FileUsage>> {
  const usage = new Map<string, FileUsage>(
    fileIds.map((id) => [id, { pages: [], codeCount: 0 }]),
  );
  if (fileIds.length === 0) return usage;

  const [pages, codes] = await Promise.all([
    db
      .select({
        id: landingPage.id,
        title: landingPage.title,
        content: sql<string>`${landingPage.content}::text`,
      })
      .from(landingPage)
      .where(
        and(
          pageScopeWhere(scope),
          like(sql`${landingPage.content}::text`, '%"fileId"%'),
        ),
      ),
    db
      .select({ destinationUrl: qrCode.destinationUrl })
      .from(qrCode)
      .where(
        and(
          codeScopeWhere(scope),
          isNull(qrCode.deletedAt),
          like(qrCode.destinationUrl, "%/api/files/%"),
        ),
      ),
  ]);

  for (const page of pages) {
    for (const id of fileIdsInContent(page.content)) {
      usage.get(id)?.pages.push({ id: page.id, title: page.title });
    }
  }
  for (const code of codes) {
    for (const id of fileIdsInLink(code.destinationUrl)) {
      const entry = usage.get(id);
      if (entry) entry.codeCount++;
    }
  }
  return usage;
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export interface CreatedUpload {
  file: FileView;
  upload: PresignedUpload;
}

/** Checks type, plan limits and quota, then hands out a presigned PUT. */
export async function createUpload(
  scope: ActiveScope,
  input: CreateUploadInput,
): Promise<CreatedUpload> {
  assertStorageConfigured();

  const filename = displayFilename(input.filename);
  const mime = normalizeMime(input.mime, filename);
  if (!(filename && mime)) {
    throw new HttpError(
      415,
      "UNSUPPORTED_TYPE",
      `This file type isn't supported. Upload ${formatsForKinds()}.`,
    );
  }

  const limits = await scopeLimits(scope);
  let replacing: FileRow | null = null;
  if (input.replaceId) {
    replacing = await findRow(scope, input.replaceId);
    assertReplaceable(scope, replacing, mime);
  }

  await cleanupStalePending(scope);
  const check = checkUpload({
    limits,
    usedBytes: await usedBytes(scope),
    size: input.size,
    replacingBytes: replacing?.size ?? 0,
    planName: limits.planName,
  });
  if (!check.ok) throw new HttpError(413, check.code, check.message);

  const id = cuid();
  const storageKey = `${scopeSegment(scope)}/${id}/${storageFilename(filename, mime)}`;
  const upload = await presignUpload({
    key: storageKey,
    mime,
    size: input.size,
  });
  const [row] = await db
    .insert(fileAsset)
    .values({
      id,
      userId: scope.userId,
      organizationId: scope.organizationId,
      storageKey,
      filename,
      mime,
      size: input.size,
      status: "pending",
    })
    .returning();
  return { file: toView(row as FileRow, scope), upload };
}

function assertReplaceable(
  scope: ActiveScope,
  target: FileRow,
  mime: AllowedMime,
) {
  assertCanManage(scope, target);
  if (target.status !== "ready") {
    throw new HttpError(
      409,
      "NOT_REPLACEABLE",
      target.status === "blocked"
        ? "Blocked files can't be replaced."
        : "This file is still uploading.",
    );
  }
  const kind = kindOf(target);
  if (kind !== kindForMime(mime)) {
    const label =
      kind === "pdf"
        ? "PDF"
        : (kind && FILE_KIND_LABELS[kind].toLowerCase()) || "file";
    throw new HttpError(
      400,
      "KIND_MISMATCH",
      `Replace this ${label} with another ${label} file, so the pages that show it keep working.`,
    );
  }
}

const REJECTED_MESSAGES = {
  size: "The uploaded file doesn't match the size that was announced.",
  mime: "The uploaded file doesn't match its declared type.",
  type: "The file's contents don't match its type. Export it again as a real PDF, image, audio or video file.",
} as const;

/**
 * Verifies a finished upload and marks it ready. Rejected uploads are deleted
 * from storage and kept as "blocked". With `replaceId`, the new content takes
 * over that file (same id and link) and the old object is deleted.
 */
export async function finalizeUpload(
  scope: ActiveScope,
  id: string,
  { replaceId }: { replaceId?: string } = {},
): Promise<FileView> {
  assertStorageConfigured();

  const row = await findRow(scope, id);
  // Only the uploader finishes an upload.
  if (row.userId !== scope.userId) throw notFound();
  if (row.status === "ready") return toView(row, scope);
  if (row.status === "blocked" || !isAllowedMime(row.mime)) {
    throw new HttpError(
      422,
      "VERIFICATION_FAILED",
      "This upload was rejected.",
    );
  }

  const result = await verifyStoredObject({
    key: row.storageKey,
    size: row.size,
    mime: row.mime,
  });
  if (!result.ok) {
    if (result.reason === "missing") {
      throw new HttpError(
        409,
        "UPLOAD_INCOMPLETE",
        "The upload didn't reach storage. Try again.",
      );
    }
    await rejectUpload(row);
    throw new HttpError(
      422,
      "VERIFICATION_FAILED",
      REJECTED_MESSAGES[result.reason],
    );
  }

  // Content an admin removed can't simply be uploaded again.
  if (result.sha256) {
    const [blocked] = await db
      .select({ id: fileAsset.id })
      .from(fileAsset)
      .where(
        and(
          eq(fileAsset.sha256, result.sha256),
          eq(fileAsset.status, "blocked"),
        ),
      )
      .limit(1);
    if (blocked) {
      await rejectUpload(row);
      throw new HttpError(
        422,
        "VERIFICATION_FAILED",
        "This file can't be uploaded.",
      );
    }
  }

  const target = replaceId
    ? await findRow(scope, replaceId).catch(() => null)
    : null;
  if (replaceId && !target) {
    await discardUpload(row);
    throw notFound();
  }
  if (target) {
    try {
      assertReplaceable(scope, target, row.mime);
    } catch (error) {
      await discardUpload(row);
      throw error;
    }
  }

  // Authoritative quota check (presign-time checks can race).
  const limits = await scopeLimits(scope);
  const check = checkUpload({
    limits,
    usedBytes: await usedBytes(scope, {
      includePending: false,
      excludeId: target?.id,
    }),
    size: row.size,
    planName: limits.planName,
  });
  if (!check.ok) {
    await discardUpload(row);
    throw new HttpError(413, check.code, check.message);
  }

  if (!target) {
    const [ready] = await db
      .update(fileAsset)
      .set({ status: "ready", sha256: result.sha256 })
      .where(and(eq(fileAsset.id, row.id), eq(fileAsset.status, "pending")))
      .returning();
    return toView(
      ready ?? { ...row, status: "ready", sha256: result.sha256 },
      scope,
    );
  }

  // Swap the new object into the existing file; storage_key is unique, so
  // the pending row goes first (one transaction).
  const [, updated] = await db.batch([
    db.delete(fileAsset).where(eq(fileAsset.id, row.id)),
    db
      .update(fileAsset)
      .set({
        storageKey: row.storageKey,
        filename: row.filename,
        mime: row.mime,
        size: row.size,
        sha256: result.sha256,
        status: "ready",
      })
      .where(
        and(
          eq(fileAsset.id, target.id),
          eq(fileAsset.storageKey, target.storageKey),
          eq(fileAsset.status, "ready"),
        ),
      )
      .returning(),
  ]);
  const replaced = updated[0];
  if (!replaced) {
    // The target changed meanwhile (deleted, blocked or replaced).
    await deleteObject(row.storageKey).catch(() => {});
    throw new HttpError(
      409,
      "NOT_REPLACEABLE",
      "The file changed meanwhile. Try again.",
    );
  }
  await deleteObject(target.storageKey).catch((error) =>
    logError(error as Error, {
      action: "files.replace.deleteOld",
      id: target.id,
    }),
  );
  return toView(replaced, scope);
}

// ─── Delete ──────────────────────────────────────────────────────────────────

/**
 * Deletes a file and its stored object. Without `force`, files still used by
 * pages or codes are kept (409 IN_USE); those pages then show "file
 * unavailable" once it's gone.
 */
export async function deleteFile(
  scope: ActiveScope,
  id: string,
  { force = false }: { force?: boolean } = {},
): Promise<{ id: string }> {
  assertStorageConfigured();
  const row = await findRow(scope, id);
  assertCanManage(scope, row);

  if (!force) {
    const usage = (await getFileUsage(scope, [id])).get(id);
    const pages = usage?.pages.length ?? 0;
    const codes = usage?.codeCount ?? 0;
    if (pages + codes > 0) {
      const parts = [
        pages && `${pages} page${pages === 1 ? "" : "s"}`,
        codes && `${codes} code${codes === 1 ? "" : "s"}`,
      ].filter(Boolean);
      throw new HttpError(
        409,
        "IN_USE",
        `This file is used by ${parts.join(" and ")}. Deleting it shows "File unavailable" there.`,
      );
    }
  }

  await db
    .delete(fileAsset)
    .where(and(eq(fileAsset.id, id), scopeWhere(scope)));
  await deleteObject(row.storageKey).catch((error) =>
    logError(error as Error, { action: "files.delete", id }),
  );
  return { id };
}
