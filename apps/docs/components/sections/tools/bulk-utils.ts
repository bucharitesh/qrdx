export const MAX_BULK_ROWS = 5000;
export const MAX_CSV_BYTES = 10 * 1024 * 1024;

export interface CsvTable {
  columns: string[];
  rows: string[][];
  /** True when the file had more than MAX_BULK_ROWS data rows. */
  truncated: boolean;
}

/** Turns raw CSV cells into named columns and capped data rows. */
export function toTable(data: string[][], hasHeader: boolean): CsvTable {
  const width = data.reduce((max, row) => Math.max(max, row.length), 0);
  const header = hasHeader ? (data[0] ?? []) : [];
  const body = hasHeader ? data.slice(1) : data;

  return {
    columns: Array.from(
      { length: width },
      (_, i) => header[i]?.replace(/^﻿/, "").trim() || `Column ${i + 1}`,
    ),
    rows: body.slice(0, MAX_BULK_ROWS),
    truncated: body.length > MAX_BULK_ROWS,
  };
}

const VALUE_COLUMN = /^(value|url|link|data|content|text|qr|qr ?code)$/i;
const FILENAME_COLUMN = /^(file ?name|name|label|id|title|sku)$/i;

export function guessValueColumn(columns: string[]): number {
  const index = columns.findIndex((name) => VALUE_COLUMN.test(name));
  return index === -1 ? 0 : index;
}

export function guessFilenameColumn(
  columns: string[],
  valueColumn: number,
): number {
  return columns.findIndex(
    (name, i) => i !== valueColumn && FILENAME_COLUMN.test(name),
  );
}

/** Keeps names portable across Windows, macOS and Linux zip tools. */
export function sanitizeFilename(raw: string): string {
  return (
    raw
      .normalize("NFKC")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[.\-\s]+|[.\s]+$/g, "")
      .slice(0, 100)
  );
}

/** Returns a function that hands out unique (case-insensitive) file names. */
export function createFilenameAllocator() {
  const used = new Set<string>();
  const next = new Map<string, number>();

  return (base: string, extension: string): string => {
    const key = base.toLowerCase();
    let n = next.get(key) ?? 1;
    let candidate =
      n === 1 ? `${base}.${extension}` : `${base}-${n}.${extension}`;
    while (used.has(candidate.toLowerCase())) {
      n++;
      candidate = `${base}-${n}.${extension}`;
    }
    next.set(key, n + 1);
    used.add(candidate.toLowerCase());
    return candidate;
  };
}

/** Decodes the data URLs qrdx returns (base64 PNG or URI-encoded SVG). */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);

  if (meta.endsWith(";base64")) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(data));
}

/** Loads an image once so each generated code embeds it without refetching. */
export async function imageToDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const response = await fetch(src, { mode: "cors" });
  if (!response.ok) throw new Error(`Logo request failed (${response.status})`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export const SAMPLE_CSV_ROWS = [
  { value: "https://qrdx.dev", filename: "qrdx-home" },
  { value: "https://qrdx.dev/pricing", filename: "pricing" },
  {
    value: "WIFI:T:WPA;S:Office Guest;P:welcome123;H:false;;",
    filename: "office-wifi",
  },
  { value: "mailto:hello@example.com", filename: "email-us" },
  { value: "tel:+14155550132", filename: "call-us" },
];
