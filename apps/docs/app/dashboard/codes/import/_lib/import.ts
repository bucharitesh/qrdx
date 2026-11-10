import "server-only";

import { database as db, qrCode, qrCodeTag } from "@repo/database";
import { and, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { idempotencyKeySchema } from "@/app/dashboard/codes/_lib/bulk";
import { formatPlanList } from "@/app/dashboard/codes/_lib/code-options";
import {
  assertImportTargets,
  existingFolderPaths,
  existingTagNames,
  resolveFolderPaths,
  resolveTagNames,
} from "@/app/dashboard/codes/_lib/organize";
import { MAX_TAGS_PER_CODE } from "@/app/dashboard/codes/_lib/organize-shared";
import {
  type CreateCodeInput,
  createCodes,
  destinationUrlSchema,
  enforceCreateRateLimit,
  getCodeUsage,
  scopeWhere,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { HttpError } from "@/lib/error-response";
import {
  cheapestPlanWith,
  getPlanForScope,
  getPlanLimits,
  plansWith,
} from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import type { ActiveScope } from "@/lib/scope";
import { findTakenSlugs } from "@/lib/slug-claims";
import type { ThemeStyles } from "@/types/theme";
import {
  checkImportRow,
  duplicateSlugLines,
  IMPORT_CHUNK_SIZE,
  importBlocked,
  type NormalizedImportRow,
  PREVIEW_CHUNK_SIZE,
} from "./csv";

/** "Importing more than one code at a time is a Pro feature" (lib/plans.ts). */
function bulkImportMessage(): string {
  const plan = cheapestPlanWith((limits) => limits.bulkApi);
  return plan
    ? `Importing more than one code at a time is a ${PLAN_NAMES[plan]} feature.`
    : "Your plan imports one code at a time.";
}

const rowSchema = z.object({
  line: z.number().int().min(1).max(10_000_000),
  destination: z.string().max(4096),
  title: z.string().max(1000),
  folder: z.string().max(1000),
  tags: z.string().max(2000),
  slug: z.string().max(100),
});

/** One preview request: a file's rows are checked PREVIEW_CHUNK_SIZE at a time. */
export const importPreviewSchema = z.object({
  rows: z
    .array(rowSchema)
    .min(1, "The file has no rows to import")
    .max(
      PREVIEW_CHUNK_SIZE,
      `Check up to ${PREVIEW_CHUNK_SIZE} rows per request`,
    ),
  /** The custom domain the codes go on (back-halves are checked there) */
  domainId: z.string().trim().min(1).max(64).nullish(),
});

const idSchema = z.string().trim().min(1).max(64);

export const importChunkSchema = z.object({
  rows: z.array(rowSchema).min(1).max(IMPORT_CHUNK_SIZE),
  domainId: idSchema.nullable(),
  /** For every row without a folder of its own */
  folderId: idSchema.nullish(),
  /** Added to every row's tags */
  tagIds: z.array(idSchema).max(MAX_TAGS_PER_CODE).optional(),
  /**
   * The import and the chunk ("<import id>:<chunk>"): sending a chunk again
   * (a retry, a resume after a reload) returns the codes it made instead of
   * making them twice (bulk.ts idempotentCodeId).
   */
  idempotencyKey: idempotencyKeySchema.optional(),
});

type ImportRow = z.infer<typeof rowSchema>;

interface CheckedRow {
  row: NormalizedImportRow;
  errors: string[];
}

/**
 * File checks plus the server-only ones: destination rules, the plan and
 * back-half availability (on the custom domain the codes go on, or qrdx.dev).
 */
async function checkRows(
  scope: ActiveScope,
  rows: ImportRow[],
  domainId: string | null,
): Promise<CheckedRow[]> {
  const onCustomDomain = Boolean(domainId);
  const checked = rows.map((input) => {
    const { errors, normalized } = checkImportRow(input, { onCustomDomain });
    if (errors.length === 0) {
      const destination = destinationUrlSchema.safeParse(
        normalized.destinationUrl,
      );
      if (destination.success) {
        normalized.destinationUrl = destination.data;
      } else {
        errors.push(destination.error.issues[0]?.message ?? "Invalid URL");
      }
    }
    return { row: normalized, errors };
  });

  const duplicates = duplicateSlugLines(checked.map(({ row }) => row));
  const slugs = checked.flatMap(({ row, errors }) =>
    row.slug && errors.length === 0 ? [row.slug] : [],
  );
  const customSlugs =
    slugs.length === 0 ||
    getPlanLimits(await getPlanForScope(scope)).customSlugs;
  const taken =
    slugs.length > 0 && customSlugs
      ? await findTakenSlugs(slugs, domainId)
      : new Set<string>();
  for (const item of checked) {
    if (!item.row.slug) continue;
    if (!customSlugs) {
      item.errors.push(
        `Custom back-halves are part of ${formatPlanList(plansWith((limits) => limits.customSlugs))}`,
      );
    } else if (duplicates.has(item.row.line)) {
      item.errors.push("This back-half appears earlier in the file");
    } else if (taken.has(item.row.slug)) {
      item.errors.push("This back-half is already in use");
    }
  }
  return checked;
}

/** Folder paths (with their parents) and tag names an import would create. */
function newNames(
  rows: NormalizedImportRow[],
  folders: Set<string>,
  tags: Set<string>,
) {
  const newFolders = new Map<string, string>();
  const newTags = new Map<string, string>();
  for (const row of rows) {
    row.folderPath.forEach((_, index) => {
      const display = row.folderPath.slice(0, index + 1).join(" / ");
      const key = row.folderPath
        .slice(0, index + 1)
        .join("/")
        .toLowerCase();
      if (!folders.has(key) && !newFolders.has(key)) {
        newFolders.set(key, display);
      }
    });
    for (const name of row.tagNames) {
      const key = name.toLowerCase();
      if (!tags.has(key) && !newTags.has(key)) newTags.set(key, name);
    }
  }
  return {
    newFolders: [...newFolders.values()],
    newTags: [...newTags.values()],
  };
}

export interface ImportPreview {
  /** Problems by CSV line (lines without problems are left out) */
  errors: { line: number; messages: string[] }[];
  valid: number;
  invalid: number;
  newFolders: string[];
  newTags: string[];
  canBulk: boolean;
  /** Free slots for active codes; null = unlimited */
  remaining: number | null;
  /**
   * Why this request's valid rows can't be imported as they are (plan), if
   * so. A file checked in several requests: the wizard adds the counts up
   * and asks importBlocked() (csv.ts) about the whole file.
   */
  blocked: string | null;
}

export async function previewImport(
  scope: ActiveScope,
  rows: ImportRow[],
  domainId: string | null = null,
): Promise<ImportPreview> {
  const [checked, usage, folders, tags] = await Promise.all([
    checkRows(scope, rows, domainId),
    getCodeUsage(scope),
    existingFolderPaths(scope),
    existingTagNames(scope),
  ]);
  const validRows = checked
    .filter((item) => item.errors.length === 0)
    .map((item) => item.row);
  const { bulkApi } = getPlanLimits(usage.plan);
  const remaining =
    usage.limit === null ? null : Math.max(0, usage.limit - usage.used);

  const bulkPlan = cheapestPlanWith((limits) => limits.bulkApi);
  const blocked = importBlocked({
    valid: validRows.length,
    canBulk: bulkApi,
    remaining,
    bulkPlanName: bulkPlan ? PLAN_NAMES[bulkPlan] : null,
  });

  return {
    errors: checked.flatMap((item) =>
      item.errors.length > 0
        ? [{ line: item.row.line, messages: item.errors }]
        : [],
    ),
    valid: validRows.length,
    invalid: checked.length - validRows.length,
    ...newNames(validRows, folders, tags),
    canBulk: bulkApi,
    remaining,
    blocked,
  };
}

export interface ImportRowResult {
  line: number;
  ok: boolean;
  message?: string;
  code?: { id: string; slug: string; shortLink: string };
}

export interface ImportChunkResult {
  rows: ImportRowResult[];
  /** The design the chunk's codes got (the workspace's default theme), for images */
  style: ThemeStyles | null;
}

type ChunkCode = Awaited<ReturnType<typeof createCodes>>[number];

/**
 * createCodes for the chunk's valid rows. A back-half taken since the
 * preview doesn't fail the chunk: that row gets a generated one instead (and
 * a note), and the rest go through.
 */
async function createRows(
  scope: ActiveScope,
  valid: NormalizedImportRow[],
  domainId: string | null,
  idempotencyKey: string | undefined,
  notes: Map<number, string>,
): Promise<ChunkCode[]> {
  const inputs: CreateCodeInput[] = valid.map((row) => ({
    destinationUrl: row.destinationUrl,
    title: row.title,
    style: null,
    domainId,
    slug: row.slug,
  }));
  for (let attempt = 0; ; attempt++) {
    try {
      return await createCodes(scope, inputs, { idempotencyKey });
    } catch (error) {
      const details =
        error instanceof HttpError &&
        (error.code === "SLUG_TAKEN" || error.code === "INVALID_SLUG")
          ? ((error.data?.details as { index: number }[] | undefined) ?? [
              // A single row reports its problem without details.
              ...(inputs.length === 1 ? [{ index: 0 }] : []),
            ])
          : [];
      if (attempt > 0 || details.length === 0) throw error;
      for (const { index } of details) {
        const input = inputs[index];
        const row = valid[index];
        if (!(input?.slug && row)) continue;
        notes.set(
          row.line,
          `The back-half ${input.slug} was taken in the meantime, so the code got a generated one`,
        );
        input.slug = null;
      }
    }
  }
}

/**
 * Creates the valid rows of one chunk (plan limits apply as for any create),
 * then files them into folders (the row's own, else the batch's) and tags
 * them (the row's and the batch's).
 */
export async function importChunk(
  scope: ActiveScope,
  rows: ImportRow[],
  domainId: string | null,
  {
    folderId = null,
    tagIds = [],
    idempotencyKey,
  }: {
    folderId?: string | null;
    tagIds?: string[];
    idempotencyKey?: string;
  } = {},
): Promise<ImportChunkResult> {
  const checked = await checkRows(scope, rows, domainId);
  const results = new Map<number, ImportRowResult>();
  const valid: NormalizedImportRow[] = [];
  const batchTags = [...new Set(tagIds)];
  for (const item of checked) {
    if (item.row.tagNames.length + batchTags.length > MAX_TAGS_PER_CODE) {
      item.errors.push(
        `Up to ${MAX_TAGS_PER_CODE} tags per code, counting the ones for every code`,
      );
    }
    if (item.errors.length > 0) {
      results.set(item.row.line, {
        line: item.row.line,
        ok: false,
        message: item.errors.join(". "),
      });
    } else {
      valid.push(item.row);
    }
  }

  let style: ThemeStyles | null = null;
  if (valid.length > 0) {
    const limits = getPlanLimits(await getPlanForScope(scope));
    if (valid.length > 1 && !limits.bulkApi) {
      throw new HttpError(402, "PLAN_REQUIRED", bulkImportMessage());
    }
    await Promise.all([
      enforceCreateRateLimit(scope.userId),
      assertImportTargets(scope, folderId, batchTags),
    ]);

    const notes = new Map<number, string>();
    const created = await createRows(
      scope,
      valid,
      domainId,
      idempotencyKey,
      notes,
    );
    style = created[0]?.style ?? null;

    // Organizing never undoes a created code: problems become row messages.
    try {
      const [folderIds, tagIdsByName] = await Promise.all([
        resolveFolderPaths(
          scope,
          valid.flatMap((row) =>
            row.folderPath.length > 0 ? [row.folderPath] : [],
          ),
        ),
        resolveTagNames(
          scope,
          valid.flatMap((row) => row.tagNames),
        ),
      ]);

      const byFolder = new Map<string, string[]>();
      const tagPairs: { qrCodeId: string; tagId: string }[] = [];
      valid.forEach((row, index) => {
        const code = created[index];
        if (!code) return;
        const target =
          row.folderPath.length > 0
            ? folderIds.get(row.folderPath.join("/").toLowerCase())
            : folderId;
        if (target) {
          byFolder.set(target, [...(byFolder.get(target) ?? []), code.id]);
        }
        const codeTags = new Set(batchTags);
        for (const name of row.tagNames) {
          const tagId = tagIdsByName.get(name.toLowerCase());
          if (tagId) codeTags.add(tagId);
        }
        for (const tagId of codeTags) {
          tagPairs.push({ qrCodeId: code.id, tagId });
        }
      });
      await Promise.all([
        ...[...byFolder].map(([target, ids]) =>
          db
            .update(qrCode)
            .set({ folderId: target })
            // A replayed chunk leaves codes moved since then where they are.
            .where(
              and(
                inArray(qrCode.id, ids),
                scopeWhere(scope),
                isNull(qrCode.folderId),
              ),
            ),
        ),
        tagPairs.length > 0
          ? db.insert(qrCodeTag).values(tagPairs).onConflictDoNothing()
          : Promise.resolve(),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Folders and tags weren't applied";
      for (const row of valid) notes.set(row.line, `Created, but ${message}`);
    }

    valid.forEach((row, index) => {
      const code = created[index];
      results.set(row.line, {
        line: row.line,
        ok: Boolean(code),
        message: code ? notes.get(row.line) : "Not created",
        code: code
          ? { id: code.id, slug: code.slug, shortLink: code.shortLink }
          : undefined,
      });
    });
  }

  return {
    rows: rows.map(
      (row) =>
        results.get(row.line) ?? {
          line: row.line,
          ok: false,
          message: "Skipped",
        },
    ),
    style,
  };
}
