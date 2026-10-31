import "server-only";

import { database as db, folder, qrCode, qrCodeTag, tag } from "@repo/database";
import cuid from "cuid";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  type SQL,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertBindableDomains } from "@/app/dashboard/domains/_lib/domains";
import { HttpError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError, ValidationError } from "@/types/errors";
import {
  type FolderRow,
  folderPath,
  folderSubtreeIds,
  MAX_BULK_IDS,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME,
  MAX_FOLDERS,
  MAX_NOTES_LENGTH,
  MAX_TAG_NAME,
  MAX_TAGS,
  MAX_TAGS_PER_CODE,
  subtreeHeight,
  TAG_COLORS,
  type TagColor,
} from "./organize-shared";
import {
  countUnarchived,
  createCodes,
  enforceCreateRateLimit,
  limitReached,
  MAX_TITLE_LENGTH,
  type QrCodeView,
  scopeWhere,
} from "./qr-codes";

/**
 * Organizing dynamic codes: folders, tags, favourites, notes, duplicates,
 * the trash and bulk actions. Server actions (actions/folders.ts, tags.ts,
 * bulk-codes.ts) are thin wrappers around these.
 *
 * Team rule: any member may organize; renaming or deleting a folder or tag
 * and trashing or purging codes is limited to what the member created
 * (owners and admins may act on everything).
 */

// ─── Action plumbing ─────────────────────────────────────────────────────────

export type OrganizeErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "LIMIT_REACHED"
  | "PLAN_REQUIRED"
  | "RATE_LIMITED"
  | "DOMAIN_NOT_VERIFIED"
  | "UNKNOWN_ERROR";

export type OrganizeResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: OrganizeErrorCode; message: string } };

const KNOWN_CODES = new Set<string>([
  "NOT_FOUND",
  "FORBIDDEN",
  "LIMIT_REACHED",
  "PLAN_REQUIRED",
  "RATE_LIMITED",
  "DOMAIN_NOT_VERIFIED",
]);

function failure(error: unknown, action: string): OrganizeResult<never> {
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: { code: "UNAUTHORIZED", message: "Sign in to manage your codes." },
    };
  }
  if (error instanceof ValidationError) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: error.message },
    };
  }
  if (error instanceof HttpError) {
    return {
      success: false,
      error: {
        code: KNOWN_CODES.has(error.code)
          ? (error.code as OrganizeErrorCode)
          : error.status === 400 || error.status === 422
            ? "VALIDATION_ERROR"
            : "UNKNOWN_ERROR",
        message: error.message,
      },
    };
  }
  logError(error as Error, { action });
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Something went wrong." },
  };
}

export function parseInput<T extends z.ZodType>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues[0]?.message ?? "Invalid input",
    );
  }
  return result.data;
}

/** Resolves the caller's scope (never from the client), runs `fn`, maps errors. */
export async function runOrganize<T>(
  action: string,
  fn: (scope: ActiveScope) => Promise<T>,
  { revalidate = true } = {},
): Promise<OrganizeResult<T>> {
  try {
    const data = await fn(await getActiveScope());
    if (revalidate) revalidatePath("/dashboard", "layout");
    return { success: true, data };
  } catch (error) {
    return failure(error, action);
  }
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const idSchema = z.string().trim().min(1).max(64);

export const idsSchema = z
  .array(idSchema)
  .min(1, "Select at least one code")
  .max(MAX_BULK_IDS, `Select up to ${MAX_BULK_IDS} codes at a time`)
  .transform((ids) => [...new Set(ids)]);

const collapse = (value: string) => value.replace(/\s+/g, " ");

export const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a folder name")
  .max(
    MAX_FOLDER_NAME,
    `Folder names can be up to ${MAX_FOLDER_NAME} characters`,
  )
  .refine((value) => !value.includes("/"), "Folder names can't contain /")
  .transform(collapse);

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a tag name")
  .max(MAX_TAG_NAME, `Tag names can be up to ${MAX_TAG_NAME} characters`)
  .refine((value) => !/[;|,]/.test(value), "Tag names can't contain , ; or |")
  .transform(collapse);

export const tagColorSchema = z.enum(TAG_COLORS);

export const notesSchema = z
  .string()
  .max(MAX_NOTES_LENGTH, `Notes can be up to ${MAX_NOTES_LENGTH} characters`)
  .transform((value) => value.trim() || null);

// ─── Scope helpers ───────────────────────────────────────────────────────────

const folderScope = (scope: ActiveScope): SQL =>
  scope.organizationId
    ? eq(folder.organizationId, scope.organizationId)
    : (and(
        eq(folder.userId, scope.userId),
        isNull(folder.organizationId),
      ) as SQL);

const tagScope = (scope: ActiveScope): SQL =>
  scope.organizationId
    ? eq(tag.organizationId, scope.organizationId)
    : (and(eq(tag.userId, scope.userId), isNull(tag.organizationId)) as SQL);

/** Owners and admins act on everything in a team; members on what they created. */
const canManageAll = (scope: ActiveScope) =>
  !scope.organizationId || scope.role !== "member";

/** Narrows a code query to what the caller may trash or purge. */
const deletableWhere = (scope: ActiveScope): SQL | undefined =>
  canManageAll(scope) ? undefined : eq(qrCode.userId, scope.userId);

function assertCreator(
  scope: ActiveScope,
  row: { userId: string },
  what: string,
) {
  if (!canManageAll(scope) && row.userId !== scope.userId) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      `Only team owners and admins can change ${what} created by others.`,
    );
  }
}

const sameName = (a: string, b: string) =>
  a.localeCompare(b, "en", { sensitivity: "accent" }) === 0;

// ─── Folders ─────────────────────────────────────────────────────────────────

interface FolderRecord {
  id: string;
  userId: string;
  name: string;
  parentId: string | null;
  position: number;
}

async function scopeFolders(scope: ActiveScope): Promise<FolderRecord[]> {
  return db
    .select({
      id: folder.id,
      userId: folder.userId,
      name: folder.name,
      parentId: folder.parentId,
      position: folder.position,
    })
    .from(folder)
    .where(folderScope(scope))
    .orderBy(asc(folder.position), asc(folder.name))
    .limit(MAX_FOLDERS + 1);
}

function requireFolder(folders: FolderRecord[], id: string): FolderRecord {
  const row = folders.find((candidate) => candidate.id === id);
  if (!row) throw new HttpError(404, "NOT_FOUND", "Folder not found");
  return row;
}

function assertUniqueSibling(
  folders: FolderRecord[],
  parentId: string | null,
  name: string,
  exceptId?: string,
) {
  const taken = folders.some(
    (row) =>
      row.parentId === parentId &&
      row.id !== exceptId &&
      sameName(row.name, name),
  );
  if (taken) {
    throw new ValidationError(`A folder named "${name}" already exists there.`);
  }
}

function assertDepth(
  folders: FolderRecord[],
  parentId: string | null,
  height = 1,
) {
  const parentDepth = parentId ? folderPath(folders, parentId).length : 0;
  if (parentDepth + height > MAX_FOLDER_DEPTH) {
    throw new ValidationError(
      `Folders can be nested up to ${MAX_FOLDER_DEPTH} levels deep.`,
    );
  }
}

const nextPosition = (folders: FolderRecord[], parentId: string | null) =>
  folders
    .filter((row) => row.parentId === parentId)
    .reduce((highest, row) => Math.max(highest, row.position + 1), 0);

/** Every folder of the scope with its count of active codes. */
export async function listFolders(scope: ActiveScope): Promise<FolderRow[]> {
  const [folders, counts] = await Promise.all([
    scopeFolders(scope),
    db
      .select({ folderId: qrCode.folderId, total: count() })
      .from(qrCode)
      .where(
        and(
          scopeWhere(scope),
          isNotNull(qrCode.folderId),
          isNull(qrCode.archivedAt),
          isNull(qrCode.deletedAt),
        ),
      )
      .groupBy(qrCode.folderId),
  ]);
  const totals = new Map(counts.map((row) => [row.folderId, row.total]));
  return folders.slice(0, MAX_FOLDERS).map(({ userId: _userId, ...row }) => ({
    ...row,
    codeCount: totals.get(row.id) ?? 0,
  }));
}

export async function createFolder(
  scope: ActiveScope,
  { name, parentId }: { name: string; parentId: string | null },
): Promise<FolderRow> {
  const folders = await scopeFolders(scope);
  if (folders.length >= MAX_FOLDERS) {
    throw new HttpError(
      400,
      "LIMIT_REACHED",
      `You can have up to ${MAX_FOLDERS} folders.`,
    );
  }
  if (parentId) requireFolder(folders, parentId);
  assertDepth(folders, parentId);
  assertUniqueSibling(folders, parentId, name);

  const row = {
    id: cuid(),
    userId: scope.userId,
    organizationId: scope.organizationId,
    parentId,
    name,
    position: nextPosition(folders, parentId),
    createdAt: new Date(),
  };
  await db.insert(folder).values(row);
  return { id: row.id, name, parentId, position: row.position, codeCount: 0 };
}

export async function renameFolder(
  scope: ActiveScope,
  { id, name }: { id: string; name: string },
): Promise<void> {
  const folders = await scopeFolders(scope);
  const current = requireFolder(folders, id);
  assertCreator(scope, current, "folders");
  assertUniqueSibling(folders, current.parentId, name, id);
  await db
    .update(folder)
    .set({ name })
    .where(and(eq(folder.id, id), folderScope(scope)));
}

export async function moveFolder(
  scope: ActiveScope,
  { id, parentId }: { id: string; parentId: string | null },
): Promise<void> {
  const folders = await scopeFolders(scope);
  const current = requireFolder(folders, id);
  assertCreator(scope, current, "folders");
  if (current.parentId === parentId) return;
  if (parentId) {
    requireFolder(folders, parentId);
    if (folderSubtreeIds(folders, id).has(parentId)) {
      throw new ValidationError("A folder can't be moved into itself.");
    }
  }
  assertDepth(folders, parentId, subtreeHeight(folders, id));
  assertUniqueSibling(folders, parentId, current.name, id);
  await db
    .update(folder)
    .set({ parentId, position: nextPosition(folders, parentId) })
    .where(and(eq(folder.id, id), folderScope(scope)));
}

/** Its codes and subfolders move up to the parent folder (or the top level). */
export async function deleteFolder(
  scope: ActiveScope,
  id: string,
): Promise<{ parentId: string | null }> {
  const folders = await scopeFolders(scope);
  const current = requireFolder(folders, id);
  assertCreator(scope, current, "folders");
  const parentId = current.parentId;
  await db.batch([
    db
      .update(qrCode)
      .set({ folderId: parentId })
      .where(and(eq(qrCode.folderId, id), scopeWhere(scope))),
    db
      .update(folder)
      .set({ parentId })
      .where(and(eq(folder.parentId, id), folderScope(scope))),
    db.delete(folder).where(and(eq(folder.id, id), folderScope(scope))),
  ]);
  return { parentId };
}

/**
 * Folder ids for slash paths ("Marketing / Spring"), creating missing ones.
 * Keys of the result are the paths joined with "/" in lower case.
 */
export async function resolveFolderPaths(
  scope: ActiveScope,
  paths: string[][],
): Promise<Map<string, string>> {
  const folders = await scopeFolders(scope);
  const result = new Map<string, string>();
  const created: (typeof folder.$inferInsert)[] = [];

  const childId = (parentId: string | null, name: string, depth: number) => {
    const existing = folders.find(
      (row) => row.parentId === parentId && sameName(row.name, name),
    );
    if (existing) return existing.id;
    if (depth > MAX_FOLDER_DEPTH) {
      throw new ValidationError(
        `Folders can be nested up to ${MAX_FOLDER_DEPTH} levels deep.`,
      );
    }
    if (folders.length >= MAX_FOLDERS) {
      throw new HttpError(
        400,
        "LIMIT_REACHED",
        `You can have up to ${MAX_FOLDERS} folders.`,
      );
    }
    const row: FolderRecord = {
      id: cuid(),
      userId: scope.userId,
      name,
      parentId,
      position: nextPosition(folders, parentId),
    };
    folders.push(row);
    created.push({
      ...row,
      organizationId: scope.organizationId,
      createdAt: new Date(),
    });
    return row.id;
  };

  for (const path of paths) {
    let parentId: string | null = null;
    for (const [index, name] of path.entries()) {
      parentId = childId(parentId, name, index + 1);
      result.set(
        path
          .slice(0, index + 1)
          .join("/")
          .toLowerCase(),
        parentId,
      );
    }
  }
  if (created.length > 0) await db.insert(folder).values(created);
  return result;
}

/** Folder names in the scope that already exist, for import previews. */
export async function existingFolderPaths(
  scope: ActiveScope,
): Promise<Set<string>> {
  const folders = await scopeFolders(scope);
  return new Set(
    folders.map((row) =>
      folderPath(folders, row.id)
        .map((part) => part.name)
        .join("/")
        .toLowerCase(),
    ),
  );
}

// ─── Tags ────────────────────────────────────────────────────────────────────

export interface TagRow {
  id: string;
  name: string;
  color: TagColor;
  codeCount: number;
}

async function scopeTags(scope: ActiveScope) {
  return db
    .select({
      id: tag.id,
      userId: tag.userId,
      name: tag.name,
      color: tag.color,
    })
    .from(tag)
    .where(tagScope(scope))
    .orderBy(asc(tag.name))
    .limit(MAX_TAGS + 1);
}

const asColor = (value: string | null): TagColor =>
  TAG_COLORS.includes(value as TagColor) ? (value as TagColor) : "gray";

export async function listTags(scope: ActiveScope): Promise<TagRow[]> {
  const [tags, counts] = await Promise.all([
    scopeTags(scope),
    db
      .select({ tagId: qrCodeTag.tagId, total: count() })
      .from(qrCodeTag)
      .innerJoin(qrCode, eq(qrCode.id, qrCodeTag.qrCodeId))
      .where(and(scopeWhere(scope), isNull(qrCode.deletedAt)))
      .groupBy(qrCodeTag.tagId),
  ]);
  const totals = new Map(counts.map((row) => [row.tagId, row.total]));
  return tags.slice(0, MAX_TAGS).map((row) => ({
    id: row.id,
    name: row.name,
    color: asColor(row.color),
    codeCount: totals.get(row.id) ?? 0,
  }));
}

function assertUniqueTag(
  tags: { id: string; name: string }[],
  name: string,
  exceptId?: string,
) {
  if (tags.some((row) => row.id !== exceptId && sameName(row.name, name))) {
    throw new ValidationError(`A tag named "${name}" already exists.`);
  }
}

export async function createTag(
  scope: ActiveScope,
  { name, color }: { name: string; color: TagColor },
): Promise<TagRow> {
  const tags = await scopeTags(scope);
  if (tags.length >= MAX_TAGS) {
    throw new HttpError(
      400,
      "LIMIT_REACHED",
      `You can have up to ${MAX_TAGS} tags.`,
    );
  }
  assertUniqueTag(tags, name);
  const row = {
    id: cuid(),
    userId: scope.userId,
    organizationId: scope.organizationId,
    name,
    color,
    createdAt: new Date(),
  };
  await db.insert(tag).values(row);
  return { id: row.id, name, color, codeCount: 0 };
}

export async function updateTag(
  scope: ActiveScope,
  { id, name, color }: { id: string; name?: string; color?: TagColor },
): Promise<void> {
  const tags = await scopeTags(scope);
  const current = tags.find((row) => row.id === id);
  if (!current) throw new HttpError(404, "NOT_FOUND", "Tag not found");
  assertCreator(scope, current, "tags");
  if (name !== undefined) assertUniqueTag(tags, name, id);
  await db
    .update(tag)
    .set({
      ...(name !== undefined && { name }),
      ...(color !== undefined && { color }),
    })
    .where(and(eq(tag.id, id), tagScope(scope)));
}

export async function deleteTag(scope: ActiveScope, id: string): Promise<void> {
  const tags = await scopeTags(scope);
  const current = tags.find((row) => row.id === id);
  if (!current) throw new HttpError(404, "NOT_FOUND", "Tag not found");
  assertCreator(scope, current, "tags");
  // qr_code_tag rows go with it (on delete cascade).
  await db.delete(tag).where(and(eq(tag.id, id), tagScope(scope)));
}

/** Tag ids by lower-case name, creating missing tags (round-robin colors). */
export async function resolveTagNames(
  scope: ActiveScope,
  names: string[],
): Promise<Map<string, string>> {
  const tags = await scopeTags(scope);
  const result = new Map<string, string>();
  const created: (typeof tag.$inferInsert)[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (result.has(key)) continue;
    const existing = tags.find((row) => sameName(row.name, name));
    if (existing) {
      result.set(key, existing.id);
      continue;
    }
    if (tags.length + created.length >= MAX_TAGS) {
      throw new HttpError(
        400,
        "LIMIT_REACHED",
        `You can have up to ${MAX_TAGS} tags.`,
      );
    }
    const row = {
      id: cuid(),
      userId: scope.userId,
      organizationId: scope.organizationId,
      name,
      color: TAG_COLORS[(tags.length + created.length) % TAG_COLORS.length],
      createdAt: new Date(),
    };
    created.push(row);
    result.set(key, row.id);
  }
  if (created.length > 0) await db.insert(tag).values(created);
  return result;
}

/** Existing tag names of the scope (lower case), for import previews. */
export async function existingTagNames(
  scope: ActiveScope,
): Promise<Set<string>> {
  return new Set((await scopeTags(scope)).map((row) => row.name.toLowerCase()));
}

async function assertScopeTags(scope: ActiveScope, tagIds: string[]) {
  if (tagIds.length === 0) return;
  const rows = await db
    .select({ id: tag.id })
    .from(tag)
    .where(and(inArray(tag.id, tagIds), tagScope(scope)));
  if (rows.length !== new Set(tagIds).size) {
    throw new HttpError(404, "NOT_FOUND", "Tag not found");
  }
}

// ─── Codes: organize ─────────────────────────────────────────────────────────

/** Codes of the scope among `ids` (outside the trash unless `trashed`). */
function codesWhere(
  scope: ActiveScope,
  ids: string[],
  { trashed = false } = {},
): SQL {
  return and(
    inArray(qrCode.id, ids),
    scopeWhere(scope),
    trashed ? isNotNull(qrCode.deletedAt) : isNull(qrCode.deletedAt),
  ) as SQL;
}

const updatedCount = (rows: unknown[]) => ({ updated: rows.length });

export async function setFavorite(
  scope: ActiveScope,
  ids: string[],
  favorite: boolean,
) {
  return updatedCount(
    await db
      .update(qrCode)
      .set({ isFavorite: favorite })
      .where(codesWhere(scope, ids))
      .returning({ id: qrCode.id }),
  );
}

export async function setNotes(
  scope: ActiveScope,
  id: string,
  notes: string | null,
): Promise<void> {
  const rows = await db
    .update(qrCode)
    .set({ notes })
    .where(codesWhere(scope, [id]))
    .returning({ id: qrCode.id });
  if (rows.length === 0) {
    throw new HttpError(404, "NOT_FOUND", "QR code not found");
  }
}

export async function moveCodes(
  scope: ActiveScope,
  ids: string[],
  folderId: string | null,
) {
  if (folderId) requireFolder(await scopeFolders(scope), folderId);
  return updatedCount(
    await db
      .update(qrCode)
      .set({ folderId })
      .where(codesWhere(scope, ids))
      .returning({ id: qrCode.id }),
  );
}

async function assertTagRoom(ids: string[], adding: string[]) {
  if (adding.length === 0) return;
  const rows = await db
    .select({ codeId: qrCodeTag.qrCodeId, tagId: qrCodeTag.tagId })
    .from(qrCodeTag)
    .where(inArray(qrCodeTag.qrCodeId, ids));
  const tagsByCode = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = tagsByCode.get(row.codeId) ?? new Set();
    set.add(row.tagId);
    tagsByCode.set(row.codeId, set);
  }
  for (const id of ids) {
    const tags = new Set([...(tagsByCode.get(id) ?? []), ...adding]);
    if (tags.size > MAX_TAGS_PER_CODE) {
      throw new ValidationError(
        `A code can have up to ${MAX_TAGS_PER_CODE} tags.`,
      );
    }
  }
}

/** Adds and/or removes tags on several codes. */
export async function tagCodes(
  scope: ActiveScope,
  ids: string[],
  { add = [], remove = [] }: { add?: string[]; remove?: string[] },
) {
  await assertScopeTags(scope, [...add, ...remove]);
  const codes = await db
    .select({ id: qrCode.id })
    .from(qrCode)
    .where(codesWhere(scope, ids));
  const codeIds = codes.map((row) => row.id);
  if (codeIds.length === 0) return { updated: 0 };
  const adding = add.filter((id) => !remove.includes(id));
  await assertTagRoom(codeIds, adding);

  if (remove.length > 0) {
    await db
      .delete(qrCodeTag)
      .where(
        and(
          inArray(qrCodeTag.qrCodeId, codeIds),
          inArray(qrCodeTag.tagId, remove),
        ),
      );
  }
  if (adding.length > 0) {
    await db
      .insert(qrCodeTag)
      .values(
        codeIds.flatMap((qrCodeId) =>
          adding.map((tagId) => ({ qrCodeId, tagId })),
        ),
      )
      .onConflictDoNothing();
  }
  return { updated: codeIds.length };
}

/** Replaces one code's tags. */
export async function setCodeTags(
  scope: ActiveScope,
  codeId: string,
  tagIds: string[],
): Promise<void> {
  const unique = [...new Set(tagIds)];
  if (unique.length > MAX_TAGS_PER_CODE) {
    throw new ValidationError(
      `A code can have up to ${MAX_TAGS_PER_CODE} tags.`,
    );
  }
  await assertScopeTags(scope, unique);
  const [code] = await db
    .select({ id: qrCode.id })
    .from(qrCode)
    .where(codesWhere(scope, [codeId]));
  if (!code) throw new HttpError(404, "NOT_FOUND", "QR code not found");

  const clear = db.delete(qrCodeTag).where(eq(qrCodeTag.qrCodeId, codeId));
  if (unique.length === 0) {
    await clear;
    return;
  }
  await db.batch([
    clear,
    db
      .insert(qrCodeTag)
      .values(unique.map((tagId) => ({ qrCodeId: codeId, tagId })))
      .onConflictDoNothing(),
  ]);
}

// ─── Codes: state ────────────────────────────────────────────────────────────

/**
 * Paused codes send visitors to the owner's fallback URL or a neutral
 * "paused" page (lib/redirect/lifecycle.ts). Available on every plan.
 */
export async function setPaused(
  scope: ActiveScope,
  ids: string[],
  paused: boolean,
) {
  return updatedCount(
    await db
      .update(qrCode)
      .set({ pausedAt: paused ? new Date() : null })
      .where(
        and(
          codesWhere(scope, ids),
          paused ? isNull(qrCode.pausedAt) : isNotNull(qrCode.pausedAt),
        ),
      )
      .returning({ id: qrCode.id }),
  );
}

/** Re-activating codes (unarchive, restore) needs free plan slots. */
async function withSlotCheck(
  scope: ActiveScope,
  adding: number,
  apply: () => Promise<string[]>,
  undo: (ids: string[]) => Promise<unknown>,
): Promise<string[]> {
  const limit = getPlanLimits(await getPlanForScope(scope)).dynamicCodes;
  const capped = adding > 0 && Number.isFinite(limit);
  if (capped && (await countUnarchived(scope)) + adding > limit) {
    throw limitReached(limit);
  }
  const changed = await apply();
  // Concurrent requests may have used the same slots: re-check after writing.
  if (capped && (await countUnarchived(scope)) > limit) {
    await undo(changed);
    throw limitReached(limit);
  }
  return changed;
}

export async function setArchived(
  scope: ActiveScope,
  ids: string[],
  archived: boolean,
) {
  if (archived) {
    return updatedCount(
      await db
        .update(qrCode)
        .set({ archivedAt: new Date() })
        .where(and(codesWhere(scope, ids), isNull(qrCode.archivedAt)))
        .returning({ id: qrCode.id }),
    );
  }
  const where = and(codesWhere(scope, ids), isNotNull(qrCode.archivedAt));
  const [{ total = 0 } = {}] = await db
    .select({ total: count() })
    .from(qrCode)
    .where(where);
  const changed = await withSlotCheck(
    scope,
    total,
    async () =>
      (
        await db
          .update(qrCode)
          .set({ archivedAt: null })
          .where(where)
          .returning({ id: qrCode.id })
      ).map((row) => row.id),
    (changedIds) =>
      db
        .update(qrCode)
        .set({ archivedAt: new Date() })
        .where(inArray(qrCode.id, changedIds)),
  );
  return { updated: changed.length };
}

/** Trashed codes stop redirecting (410) and free their slot; restorable. */
export async function trashCodes(scope: ActiveScope, ids: string[]) {
  const rows = await db
    .update(qrCode)
    .set({ deletedAt: new Date() })
    .where(and(codesWhere(scope, ids), deletableWhere(scope)))
    .returning({ id: qrCode.id });
  return { updated: rows.length, skipped: ids.length - rows.length };
}

export async function restoreCodes(scope: ActiveScope, ids: string[]) {
  const where = codesWhere(scope, ids, { trashed: true });
  const [{ total = 0 } = {}] = await db
    .select({ total: count() })
    .from(qrCode)
    .where(and(where, isNull(qrCode.archivedAt)));
  const changed = await withSlotCheck(
    scope,
    total,
    async () =>
      (
        await db
          .update(qrCode)
          .set({ deletedAt: null })
          .where(where)
          .returning({ id: qrCode.id })
      ).map((row) => row.id),
    (changedIds) =>
      db
        .update(qrCode)
        .set({ deletedAt: new Date() })
        .where(inArray(qrCode.id, changedIds)),
  );
  return { updated: changed.length };
}

/** Permanently deletes trashed codes with their scan history. */
export async function purgeCodes(scope: ActiveScope, ids: string[]) {
  const rows = await db
    .delete(qrCode)
    .where(
      and(codesWhere(scope, ids, { trashed: true }), deletableWhere(scope)),
    )
    .returning({ id: qrCode.id });
  return { updated: rows.length, skipped: ids.length - rows.length };
}

export async function emptyTrash(scope: ActiveScope) {
  const rows = await db
    .delete(qrCode)
    .where(
      and(
        scopeWhere(scope),
        isNotNull(qrCode.deletedAt),
        deletableWhere(scope),
      ),
    )
    .returning({ id: qrCode.id });
  return { updated: rows.length };
}

export async function countTrash(scope: ActiveScope): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(qrCode)
    .where(and(scopeWhere(scope), isNotNull(qrCode.deletedAt)));
  return row?.total ?? 0;
}

// ─── Codes: duplicate ────────────────────────────────────────────────────────

function copyTitle(title: string | null, destination: string): string {
  const base = title || destination.replace(/^https?:\/\//i, "");
  const suffix = " (copy)";
  return base.length + suffix.length > MAX_TITLE_LENGTH
    ? `${base.slice(0, MAX_TITLE_LENGTH - suffix.length - 1)}…${suffix}`
    : `${base}${suffix}`;
}

/**
 * A new code with the same destination, design, folder, tags, notes and the
 * settings the plan includes. New slug; scans and history are never copied.
 * Counts against the plan like any new code.
 */
export async function duplicateCode(
  scope: ActiveScope,
  id: string,
): Promise<QrCodeView> {
  const [source] = await db
    .select()
    .from(qrCode)
    .where(codesWhere(scope, [id]));
  if (!source) throw new HttpError(404, "NOT_FOUND", "QR code not found");

  await enforceCreateRateLimit(scope.userId);
  const limits = getPlanLimits(await getPlanForScope(scope));

  let domainId = source.domainId;
  if (domainId) {
    try {
      await assertBindableDomains(scope, [domainId]);
    } catch {
      // The domain left the plan or the scope: the copy uses the default link.
      domainId = null;
    }
  }

  const [copy] = await createCodes(scope, [
    {
      destinationUrl: source.destinationUrl,
      title: copyTitle(source.title, source.destinationUrl),
      style: source.style,
      domainId,
    },
  ]);
  if (!copy) throw new HttpError(503, "UNAVAILABLE", "Please try again.");

  const [tagRows] = await Promise.all([
    db
      .select({ tagId: qrCodeTag.tagId })
      .from(qrCodeTag)
      .where(eq(qrCodeTag.qrCodeId, source.id)),
    db
      .update(qrCode)
      .set({
        kind: source.kind,
        pageId: source.pageId,
        contentType: source.contentType,
        folderId: source.folderId,
        notes: source.notes,
        ...(limits.linkControls && {
          passwordHash: source.passwordHash,
          startsAt: source.startsAt,
          expiresAt: source.expiresAt,
          scanLimit: source.scanLimit,
          fallbackUrl: source.fallbackUrl,
        }),
        ...(limits.routing && { routing: source.routing, utm: source.utm }),
        ...(limits.pixels && { pixels: source.pixels }),
      })
      .where(eq(qrCode.id, copy.id)),
  ]);
  if (tagRows.length > 0) {
    await db
      .insert(qrCodeTag)
      .values(tagRows.map((row) => ({ qrCodeId: copy.id, tagId: row.tagId })))
      .onConflictDoNothing();
  }
  return copy;
}
