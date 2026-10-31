// CSV import of dynamic codes: column mapping and per-row checks shared by
// the browser preview and the server (which re-checks everything).

import {
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME,
  MAX_TAG_NAME,
  MAX_TAGS_PER_CODE,
  splitFolderPath,
  splitTagNames,
} from "@/app/dashboard/codes/_lib/organize-shared";
import { isReservedSlug, SLUG_LENGTH } from "@/lib/short-links";

export const MAX_IMPORT_ROWS = 1000;
/** Rows per server request (the create API's bulk cap). */
export const IMPORT_CHUNK_SIZE = 100;
// Keeps the preview request under the 2 MB server action body limit.
export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;

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

const SLUG_PATTERN = new RegExp(`^[0-9A-Za-z]{${SLUG_LENGTH}}$`);

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

/** Problems with a row (empty = importable as far as the file goes). */
export function checkImportRow(row: ImportRowInput): {
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
    if (!SLUG_PATTERN.test(slug)) {
      errors.push(
        `Slugs are exactly ${SLUG_LENGTH} letters or digits (A–Z, a–z, 0–9)`,
      );
    } else if (isReservedSlug(slug)) {
      errors.push("This slug is reserved");
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
