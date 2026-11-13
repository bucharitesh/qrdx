// CSV import of dynamic codes: column mapping and per-row checks shared by
// the browser preview and the server (which re-checks everything).

import { IMPORT_CHUNK_ROWS } from "@repo/config";
import {
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_NAME,
  MAX_TAG_NAME,
  MAX_TAGS_PER_CODE,
  splitFolderPath,
  splitTagNames,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import {
  CUSTOM_SLUG_MAX,
  CUSTOM_SLUG_MIN,
  SLUG_PROBLEM_MESSAGES,
  slugProblem,
} from "@/lib/short-links";

export { MAX_IMPORT_ROWS } from "@repo/config";
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

/**
 * A row's problem as a stable code and its values. The server and the API
 * keep the English text (importIssueText); the wizard shows the person's
 * language by code (app.dashboard.codes.import.issues).
 */
export const IMPORT_ISSUE_CODES = [
  "destinationMissing",
  "destinationTooLong",
  "destinationNotUrl",
  "destinationProtocol",
  "destinationCredentials",
  "destinationShortLink",
  "destinationRejected",
  "titleTooLong",
  "folderDepth",
  "folderNameTooLong",
  "tooManyTags",
  "tooManyTagsWithBatch",
  "tagNameTooLong",
  "slugReserved",
  "slugLength",
  "slugCharacters",
  "slugDash",
  "slugDuplicate",
  "slugTaken",
  "slugNotOnPlan",
] as const;

export type ImportIssueCode = (typeof IMPORT_ISSUE_CODES)[number];

export interface ImportIssue {
  code: ImportIssueCode;
  values?: Record<string, string | number>;
}

/** The English text of an issue (what the server and the API return). */
export function importIssueText(issue: ImportIssue): string {
  const v = issue.values ?? {};
  switch (issue.code) {
    case "destinationMissing":
      return "Destination URL is missing";
    case "destinationTooLong":
      return "Destination URL is too long";
    case "destinationNotUrl":
      return "Destination must be a full URL starting with https://";
    case "destinationProtocol":
      return "Only http:// and https:// destinations can be used";
    case "destinationCredentials":
      return "Destinations with a username or password are not allowed";
    case "destinationShortLink":
      return "A dynamic code cannot point to another QRdx short link";
    case "destinationRejected":
      return String(v.reason ?? "Invalid URL");
    case "titleTooLong":
      return `Title is longer than ${v.max} characters`;
    case "folderDepth":
      return `Folders can be nested up to ${v.max} levels`;
    case "folderNameTooLong":
      return `Folder names can be up to ${v.max} characters`;
    case "tooManyTags":
      return `Up to ${v.max} tags per code`;
    case "tooManyTagsWithBatch":
      return `Up to ${v.max} tags per code, counting the ones for every code`;
    case "tagNameTooLong":
      return `Tag names can be up to ${v.max} characters`;
    case "slugReserved":
      return "This back-half is reserved";
    case "slugLength":
      return `Back-half: ${SLUG_PROBLEM_MESSAGES.length}`;
    case "slugCharacters":
      return `Back-half: ${SLUG_PROBLEM_MESSAGES.characters}`;
    case "slugDash":
      return `Back-half: ${SLUG_PROBLEM_MESSAGES.dash}`;
    case "slugDuplicate":
      return "This back-half appears earlier in the file";
    case "slugTaken":
      return "This back-half is already in use";
    case "slugNotOnPlan":
      return `Custom back-halves are part of ${v.plans}`;
  }
}

function destinationIssue(value: string): ImportIssue | null {
  if (!value) return { code: "destinationMissing" };
  if (value.length > MAX_DESTINATION_LENGTH) {
    return { code: "destinationTooLong" };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { code: "destinationNotUrl" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { code: "destinationProtocol" };
  }
  if (url.username || url.password) {
    return { code: "destinationCredentials" };
  }
  return null;
}

const SLUG_ISSUES = {
  length: "slugLength",
  characters: "slugCharacters",
  dash: "slugDash",
  reserved: "slugReserved",
} as const satisfies Record<
  keyof typeof SLUG_PROBLEM_MESSAGES,
  ImportIssueCode
>;

/**
 * Problems with a row (empty = importable as far as the file goes), as
 * codes (`issues`) and their English text (`errors`).
 * `onCustomDomain`: the codes go on a custom domain, where fewer back-halves
 * are reserved.
 */
export function checkImportRow(
  row: ImportRowInput,
  { onCustomDomain = false }: { onCustomDomain?: boolean } = {},
): {
  errors: string[];
  issues: ImportIssue[];
  normalized: NormalizedImportRow;
} {
  const issues: ImportIssue[] = [];
  const destinationProblem = destinationIssue(row.destination);
  if (destinationProblem) issues.push(destinationProblem);

  const title = row.title.trim().replace(/\s+/g, " ");
  if (title.length > MAX_TITLE_LENGTH) {
    issues.push({ code: "titleTooLong", values: { max: MAX_TITLE_LENGTH } });
  }

  const folderPath = splitFolderPath(row.folder);
  if (folderPath.length > MAX_FOLDER_DEPTH) {
    issues.push({ code: "folderDepth", values: { max: MAX_FOLDER_DEPTH } });
  }
  if (folderPath.some((name) => name.length > MAX_FOLDER_NAME)) {
    issues.push({
      code: "folderNameTooLong",
      values: { max: MAX_FOLDER_NAME },
    });
  }

  const tagNames = splitTagNames(row.tags);
  if (tagNames.length > MAX_TAGS_PER_CODE) {
    issues.push({ code: "tooManyTags", values: { max: MAX_TAGS_PER_CODE } });
  }
  if (tagNames.some((name) => name.length > MAX_TAG_NAME)) {
    issues.push({ code: "tagNameTooLong", values: { max: MAX_TAG_NAME } });
  }

  const slug = row.slug.trim();
  if (slug) {
    const problem = slugProblem(slug, { onCustomDomain });
    if (problem) {
      issues.push(
        problem === "length"
          ? {
              code: "slugLength",
              values: { min: CUSTOM_SLUG_MIN, max: CUSTOM_SLUG_MAX },
            }
          : { code: SLUG_ISSUES[problem] },
      );
    }
  }

  return {
    errors: issues.map(importIssueText),
    issues,
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
