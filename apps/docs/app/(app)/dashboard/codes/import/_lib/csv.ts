// CSV import of dynamic codes: column mapping and per-row checks shared by
// the browser preview and the server (which re-checks everything).

import {
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME,
  MAX_TAG_NAME,
  MAX_TAGS_PER_CODE,
  splitFolderPath,
  splitTagNames,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import { IMPORT_CHUNK_ROWS } from "@/lib/bulk-limits";
import { SLUG_PROBLEM_MESSAGES, slugProblem } from "@/lib/short-links";

export { MAX_IMPORT_ROWS } from "@/lib/bulk-limits";
/** Rows per create request (under the API's MAX_CODES_PER_REQUEST). */
export const IMPORT_CHUNK_SIZE = IMPORT_CHUNK_ROWS;
/** Rows per preview request: each stays well under the 2 MB action body limit. */
export const PREVIEW_CHUNK_SIZE = 2500;
/** Request bodies are kept under this (long URLs make big rows). */
export const MAX_CHUNK_BYTES = 1024 * 1024;
// The file is read in the browser; only rows go to the server, in chunks.
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

const MAX_DESTINATION_LENGTH = 2048;
const MAX_TITLE_LENGTH = 100;

export const IMPORT_FIELDS = [
  "destination",
  "title",
  "folder",
  "tags",
  "slug",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  destination: "Destination URL",
  title: "Title",
  folder: "Folder",
  tags: "Tags",
  slug: "Slug",
};

const ALIASES: Record<ImportField, RegExp> = {
  destination:
    /^(destination|destination[ _-]?url|url|link|long[ _-]?url|target|redirect)$/i,
  title: /^(title|name|label)$/i,
  folder: /^(folder|folder[ _-]?path|folders)$/i,
  tags: /^(tags?|labels?)$/i,
  slug: /^(slug|short[ _-]?code|back[ _-]?half)$/i,
};

/** Column index per field; -1 = not in the file. */
export type ColumnMapping = Record<ImportField, number>;

export function guessMapping(columns: string[]): ColumnMapping {
  const used = new Set<number>();
  const mapping = {} as ColumnMapping;
  for (const field of IMPORT_FIELDS) {
    const index = columns.findIndex(
      (name, i) => !used.has(i) && ALIASES[field].test(name.trim()),
    );
    mapping[field] = index;
    if (index >= 0) used.add(index);
  }
  return mapping;
}

/** One data row as sent to the server (raw strings; `line` is the CSV line). */
export interface ImportRowInput {
  line: number;
  destination: string;
  title: string;
  folder: string;
  tags: string;
  slug: string;
}

/** Data rows (after the header) mapped to fields; blank rows are skipped. */
export function rowsFromTable(
  rows: string[][],
  mapping: ColumnMapping,
): ImportRowInput[] {
  const cell = (row: string[], field: ImportField) =>
    mapping[field] >= 0 ? (row[mapping[field]] ?? "").trim() : "";
  return rows.flatMap((row, index) =>
    row.some((value) => value.trim())
      ? [
          {
            // +2: the header is line 1.
            line: index + 2,
            destination: cell(row, "destination"),
            title: cell(row, "title"),
            folder: cell(row, "folder"),
            tags: cell(row, "tags"),
            slug: cell(row, "slug"),
          },
        ]
      : [],
  );
}

export interface NormalizedImportRow {
  line: number;
  destinationUrl: string;
  title: string | null;
  folderPath: string[];
  tagNames: string[];
  slug: string | null;
}

function destinationError(value: string): string | null {
  if (!value) return "Destination URL is missing";
  if (value.length > MAX_DESTINATION_LENGTH)
    return "Destination URL is too long";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Destination must be a full URL starting with https://";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "Only http:// and https:// destinations can be used";
  }
  if (url.username || url.password) {
    return "Destinations with a username or password are not allowed";
  }
  return null;
}

/**
 * Problems with a row (empty = importable as far as the file goes).
 * `onCustomDomain`: the codes go on a custom domain, where fewer back-halves
 * are reserved.
 */
export function checkImportRow(
  row: ImportRowInput,
  { onCustomDomain = false }: { onCustomDomain?: boolean } = {},
): {
  errors: string[];
  normalized: NormalizedImportRow;
} {
  const errors: string[] = [];
  const destinationProblem = destinationError(row.destination);
  if (destinationProblem) errors.push(destinationProblem);

  const title = row.title.trim().replace(/\s+/g, " ");
  if (title.length > MAX_TITLE_LENGTH) {
    errors.push(`Title is longer than ${MAX_TITLE_LENGTH} characters`);
  }

  const folderPath = splitFolderPath(row.folder);
  if (folderPath.length > MAX_FOLDER_DEPTH) {
    errors.push(`Folders can be nested up to ${MAX_FOLDER_DEPTH} levels`);
  }
  if (folderPath.some((name) => name.length > MAX_FOLDER_NAME)) {
    errors.push(`Folder names can be up to ${MAX_FOLDER_NAME} characters`);
  }

  const tagNames = splitTagNames(row.tags);
  if (tagNames.length > MAX_TAGS_PER_CODE) {
    errors.push(`Up to ${MAX_TAGS_PER_CODE} tags per code`);
  }
  if (tagNames.some((name) => name.length > MAX_TAG_NAME)) {
    errors.push(`Tag names can be up to ${MAX_TAG_NAME} characters`);
  }

  const slug = row.slug.trim();
  if (slug) {
    const problem = slugProblem(slug, { onCustomDomain });
    if (problem) {
      errors.push(
        problem === "reserved"
          ? "This back-half is reserved"
          : `Back-half: ${SLUG_PROBLEM_MESSAGES[problem]}`,
      );
    }
  }

  return {
    errors,
    normalized: {
      line: row.line,
      destinationUrl: row.destination.trim(),
      title: title || null,
      folderPath,
      tagNames,
      slug: slug || null,
    },
  };
}

/** Lines whose slug repeats an earlier row's (slugs are case-sensitive). */
export function duplicateSlugLines(
  rows: { line: number; slug: string | null }[],
): Set<number> {
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  for (const row of rows) {
    if (!row.slug) continue;
    if (seen.has(row.slug)) duplicates.add(row.line);
    seen.add(row.slug);
  }
  return duplicates;
}

/**
 * Why `valid` rows can't be imported on this plan (null = they can):
 * several rows need a plan with bulk import, and capped plans need room.
 * `bulkPlanName`: the cheapest plan that imports in bulk, if any.
 */
export function importBlocked({
  valid,
  canBulk,
  remaining,
  bulkPlanName,
}: {
  valid: number;
  canBulk: boolean;
  remaining: number | null;
  bulkPlanName: string | null;
}): string | null {
  if (valid > 1 && !canBulk) {
    return `${
      bulkPlanName
        ? `Importing more than one code at a time is a ${bulkPlanName} feature.`
        : "Your plan imports one code at a time."
    } Upgrade, or import a file with a single row.`;
  }
  if (remaining !== null && valid > remaining) {
    return `Your plan has room for ${remaining} more active ${remaining === 1 ? "code" : "codes"}. Archive codes or upgrade to import ${valid}.`;
  }
  return null;
}

export const SAMPLE_IMPORT_ROWS = [
  {
    destination: "https://example.com/spring-menu",
    title: "Spring menu",
    folder: "Restaurant / Menus",
    tags: "print; table-tent",
    slug: "",
  },
  {
    destination: "https://example.com/wifi-help",
    title: "Guest Wi-Fi help",
    folder: "Restaurant",
    tags: "print",
    slug: "",
  },
  {
    destination: "https://example.com/review",
    title: "Leave a review",
    folder: "",
    tags: "reviews",
    slug: "",
  },
];
