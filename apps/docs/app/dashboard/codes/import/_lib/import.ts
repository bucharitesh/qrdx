import "server-only";

import { database as db, qrCode, qrCodeTag } from "@repo/database";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  existingFolderPaths,
  existingTagNames,
  resolveFolderPaths,
  resolveTagNames,
} from "@/app/dashboard/codes/_lib/organize";
import {
  createCodes,
  destinationUrlSchema,
  enforceCreateRateLimit,
  getCodeUsage,
  scopeWhere,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { HttpError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import {
  checkImportRow,
  duplicateSlugLines,
  IMPORT_CHUNK_SIZE,
  MAX_IMPORT_ROWS,
  type NormalizedImportRow,
} from "./csv";

const rowSchema = z.object({
  line: z.number().int().min(1).max(10_000_000),
  destination: z.string().max(4096),
  title: z.string().max(1000),
  folder: z.string().max(1000),
  tags: z.string().max(2000),
  slug: z.string().max(100),
});

export const importPreviewSchema = z.object({
  rows: z
    .array(rowSchema)
    .min(1, "The file has no rows to import")
    .max(MAX_IMPORT_ROWS, `Import up to ${MAX_IMPORT_ROWS} rows at a time`),
});

export const importChunkSchema = z.object({
  rows: z.array(rowSchema).min(1).max(IMPORT_CHUNK_SIZE),
  domainId: z.string().trim().min(1).max(64).nullable(),
});

type ImportRow = z.infer<typeof rowSchema>;

interface CheckedRow {
  row: NormalizedImportRow;
  errors: string[];
}

/** File checks plus the server-only ones: destination rules and slug availability. */
async function checkRows(rows: ImportRow[]): Promise<CheckedRow[]> {
  const checked = rows.map((input) => {
    const { errors, normalized } = checkImportRow(input);
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
  const taken = new Set(
    slugs.length > 0
      ? (
          await db
            .select({ slug: qrCode.slug })
            .from(qrCode)
            .where(inArray(qrCode.slug, slugs))
        ).map((row) => row.slug)
      : [],
  );
  for (const item of checked) {
    if (!item.row.slug) continue;
    if (duplicates.has(item.row.line)) {
      item.errors.push("This slug appears earlier in the file");
    } else if (taken.has(item.row.slug)) {
      item.errors.push("This slug is already in use");
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
  /** Why the valid rows can't be imported as they are (plan), if so */
  blocked: string | null;
}

export async function previewImport(
  scope: ActiveScope,
  rows: ImportRow[],
): Promise<ImportPreview> {
  const [checked, usage, folders, tags] = await Promise.all([
    checkRows(rows),
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

  let blocked: string | null = null;
  if (validRows.length > 1 && !bulkApi) {
    blocked =
      "Importing more than one code at a time is a Pro feature. Upgrade, or import a file with a single row.";
  } else if (remaining !== null && validRows.length > remaining) {
    blocked = `Your plan has room for ${remaining} more active ${remaining === 1 ? "code" : "codes"}. Archive codes or upgrade to import ${validRows.length}.`;
  }

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
  code?: { id: string; shortLink: string };
}

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  ((error as { code?: string }).code === "23505" ||
    /duplicate key|unique/i.test(String((error as Error).message)));

/**
 * Creates the valid rows of one chunk (plan limits apply as for any create),
 * then files them into folders, tags them and applies custom slugs.
 */
export async function importChunk(
  scope: ActiveScope,
  rows: ImportRow[],
  domainId: string | null,
): Promise<ImportRowResult[]> {
  const checked = await checkRows(rows);
  const results = new Map<number, ImportRowResult>();
  const valid: NormalizedImportRow[] = [];
  for (const item of checked) {
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

  if (valid.length > 0) {
    const limits = getPlanLimits(await getPlanForScope(scope));
    if (valid.length > 1 && !limits.bulkApi) {
      throw new HttpError(
        402,
        "PLAN_REQUIRED",
        "Importing more than one code at a time is a Pro feature.",
      );
    }
    await enforceCreateRateLimit(scope.userId);

    const created = await createCodes(
      scope,
      valid.map((row) => ({
        destinationUrl: row.destinationUrl,
        title: row.title,
        style: null,
        domainId,
      })),
    );

    // Organizing never undoes a created code: problems become row messages.
    const notes = new Map<number, string>();
    try {
      const [folderIds, tagIds] = await Promise.all([
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
        if (row.folderPath.length > 0) {
          const folderId = folderIds.get(
            row.folderPath.join("/").toLowerCase(),
          );
          if (folderId) {
            byFolder.set(folderId, [
              ...(byFolder.get(folderId) ?? []),
              code.id,
            ]);
          }
        }
        for (const name of row.tagNames) {
          const tagId = tagIds.get(name.toLowerCase());
          if (tagId) tagPairs.push({ qrCodeId: code.id, tagId });
        }
      });
      await Promise.all([
        ...[...byFolder].map(([folderId, ids]) =>
          db
            .update(qrCode)
            .set({ folderId })
            .where(and(inArray(qrCode.id, ids), scopeWhere(scope))),
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

    const slugged = await Promise.all(
      valid.map(async (row, index) => {
        const code = created[index];
        if (!(code && row.slug)) return code;
        try {
          await db
            .update(qrCode)
            .set({ slug: row.slug })
            .where(and(eq(qrCode.id, code.id), scopeWhere(scope)));
          return {
            ...code,
            shortLink: code.shortLink.replace(
              new RegExp(`/${code.slug}$`),
              `/${row.slug}`,
            ),
          };
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          notes.set(
            row.line,
            `Slug ${row.slug} was taken in the meantime, so the code got ${code.slug}`,
          );
          return code;
        }
      }),
    );

    valid.forEach((row, index) => {
      const code = slugged[index];
      results.set(row.line, {
        line: row.line,
        ok: Boolean(code),
        message: code ? notes.get(row.line) : "Not created",
        code: code ? { id: code.id, shortLink: code.shortLink } : undefined,
      });
    });
  }

  return rows.map(
    (row) =>
      results.get(row.line) ?? {
        line: row.line,
        ok: false,
        message: "Skipped",
      },
  );
}
