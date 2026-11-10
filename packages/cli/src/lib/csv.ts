import { createReadStream } from "node:fs";

// CSV for `qrdx batch`: read as a stream (RFC 4180 quoting, quoted line
// breaks, "" for a quote, CRLF or LF, a UTF-8 byte-order mark), so a file of
// any length never sits in memory whole. Column guessing matches the free
// bulk tool at qrdx.dev/tools/bulk, so the same CSV works in both.

/** Splits CSV text into rows, a chunk at a time. */
export class CsvParser {
  private row: string[] = [];
  private field = "";
  private quoted = false;
  /** A quote seen inside a quoted field: the end, or the first of "". */
  private quote = false;
  private started = false;
  private first = true;

  /** Rows completed by this chunk. */
  push(chunk: string): string[][] {
    const rows: string[][] = [];
    let text = chunk;
    if (this.first) {
      this.first = false;
      if (text.charCodeAt(0) === 0xfe_ff) text = text.slice(1);
    }
    for (const char of text) {
      if (this.quoted) {
        if (this.quote) {
          this.quote = false;
          if (char === '"') {
            this.field += '"';
            continue;
          }
          this.quoted = false;
          // Falls through: the character after a closing quote.
        } else if (char === '"') {
          this.quote = true;
          continue;
        } else {
          this.field += char;
          continue;
        }
      }
      if (char === '"' && this.field === "" && !this.started) {
        this.quoted = true;
        this.started = true;
      } else if (char === ",") {
        this.endField();
      } else if (char === "\n") {
        this.endRow(rows);
      } else if (char === "\r") {
        // CRLF: the \n ends the row.
      } else {
        this.field += char;
        this.started = true;
      }
    }
    return rows;
  }

  /** The last row, when the file doesn't end with a line break. */
  end(): string[][] {
    const rows: string[][] = [];
    if (this.quote) {
      this.quote = false;
      this.quoted = false;
    }
    if (this.started || this.row.length > 0) this.endRow(rows);
    return rows;
  }

  private endField() {
    this.row.push(this.field);
    this.field = "";
    this.started = false;
  }

  private endRow(rows: string[][]) {
    this.endField();
    // Blank lines carry no codes.
    if (this.row.some((cell) => cell.trim() !== "")) rows.push(this.row);
    this.row = [];
  }
}

/** Every row of a CSV file, read as a stream. */
export async function* readCsvRows(path: string): AsyncGenerator<string[]> {
  const parser = new CsvParser();
  const stream = createReadStream(path, { encoding: "utf8" });
  for await (const chunk of stream) {
    yield* parser.push(chunk as string);
  }
  yield* parser.end();
}

const VALUE_COLUMN = /^(value|url|link|data|content|text|qr|qr ?code)$/i;
const FILENAME_COLUMN = /^(file ?name|name|label|id|title|sku)$/i;

/** The column with each code's content: a known name, else the first. */
export function guessValueColumn(columns: string[]): number {
  const index = columns.findIndex((name) => VALUE_COLUMN.test(name.trim()));
  return index === -1 ? 0 : index;
}

/** The column with file names, if one has a known name; -1 for numbered files. */
export function guessFilenameColumn(
  columns: string[],
  valueColumn: number
): number {
  return columns.findIndex(
    (name, i) => i !== valueColumn && FILENAME_COLUMN.test(name.trim())
  );
}

/**
 * A column given as a header name (any case) or a 1-based number; throws
 * with the columns there are when it isn't one of them.
 */
export function resolveColumn(
  spec: string,
  columns: string[],
  flag: string
): number {
  if (/^\d+$/.test(spec)) {
    const index = Number(spec) - 1;
    if (index >= 0 && index < columns.length) return index;
  } else {
    const index = columns.findIndex(
      (name) => name.trim().toLowerCase() === spec.trim().toLowerCase()
    );
    if (index >= 0) return index;
  }
  throw new Error(
    `${flag} "${spec}" isn't a column of this file. Columns: ${columns
      .map((name, i) => `${i + 1}. ${name}`)
      .join(", ")}`
  );
}

/** Keeps names portable across Windows, macOS and Linux. */
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

/** Hands out unique (case-insensitive) file names: name, name-2, name-3, … */
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

/** One CSV cell (quoted when it needs to be). */
export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
