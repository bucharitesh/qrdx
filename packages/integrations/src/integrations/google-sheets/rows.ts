import type { SinkFormResponse, SinkScan } from "../../sinks/types";
import type { CellValue } from "./client";

export const SCAN_SHEET_TITLE = "Scans";
export const RESPONSES_SHEET_TITLE = "Responses";

/** Scan export columns; the id is last so retries can skip rows already sent. */
export const SCAN_HEADER = [
  "Time (UTC)",
  "Code",
  "Country",
  "City",
  "Device",
  "OS",
  "Browser",
  "Referrer",
  "Language",
  "Scan ID",
] as const;

/** Column letter of "Scan ID". */
export const SCAN_ID_COLUMN = "J";

/** "2026-10-31T09:30:12.345Z" → "2026-10-31 09:30:12" (sorts as text). */
export function sheetTime(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d+Z$|Z$/, "");
}

export function codeLabel(code: { slug: string; title: string | null }) {
  const title = code.title?.trim();
  return title ? `${title} (${code.slug})` : code.slug;
}

export function scanRow(scan: SinkScan): CellValue[] {
  return [
    sheetTime(scan.scannedAt),
    codeLabel(scan.code),
    scan.country ?? "",
    scan.city ?? "",
    scan.deviceType ?? "",
    scan.os ?? "",
    scan.browser ?? "",
    scan.referer ?? "",
    scan.language ?? "",
    scan.id,
  ];
}

export interface SheetForm {
  id: string;
  title: string;
  fields: Array<{ id: string; label: string }>;
}

/**
 * Responses as a table, one column per question: current questions first
 * (page order), then removed ones that still have answers. Same columns as
 * the CSV export; ratings stay numbers.
 */
export function responsesTable(
  responses: SinkFormResponse[],
  forms: SheetForm[]
): { header: string[]; rows: CellValue[][] } {
  const columns = new Map<string, string>();
  for (const form of forms) {
    for (const field of form.fields) {
      if (!columns.has(field.id)) columns.set(field.id, field.label);
    }
  }
  for (const response of [...responses].reverse()) {
    for (const answer of response.answers) {
      if (!columns.has(answer.id)) columns.set(answer.id, answer.label);
    }
  }
  const counts = new Map<string, number>();
  for (const label of columns.values()) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const questionHeaders = [...columns].map(([id, label]) =>
    (counts.get(label) ?? 0) > 1 ? `${label} (${id})` : label
  );
  const withForm = forms.length > 1;
  const titles = new Map(forms.map((form) => [form.id, form.title]));
  const header = [
    "Submitted (UTC)",
    ...(withForm ? ["Form"] : []),
    "Code",
    ...questionHeaders,
    "Response ID",
  ];
  const rows = responses.map((response): CellValue[] => {
    const answers = new Map(response.answers.map((a) => [a.id, a]));
    return [
      sheetTime(response.createdAt),
      ...(withForm ? [titles.get(response.formId) ?? response.formId] : []),
      response.codeSlug ?? "",
      ...[...columns.keys()].map((id) => {
        const answer = answers.get(id);
        if (!answer) return "";
        return (answer.type === "stars" || answer.type === "nps") &&
          typeof answer.value === "number"
          ? answer.value
          : answer.text;
      }),
      response.id,
    ];
  });
  return { header, rows };
}
