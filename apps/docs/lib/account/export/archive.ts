import { Zip, ZipDeflate } from "fflate";

/**
 * "Download my data": a ZIP built while it streams, so a large account never
 * has to fit in memory or finish before the first byte goes out. Pure: the
 * entries (./entries.ts) bring the data, scoped to one user by their queries.
 *
 * - JSON files hold everything that is naturally a list of records.
 * - CSV files hold the potentially huge tables (scans), read page by page and
 *   capped at `maxRows`; README.txt says when a file was cut short.
 * - README.txt comes last, because only then are the row counts known.
 */

export interface JsonExportEntry {
  kind: "json";
  path: string;
  title: string;
  description: string;
  load: () => Promise<unknown>;
}

export interface CsvExportEntry {
  kind: "csv";
  path: string;
  title: string;
  description: string;
  columns: readonly string[];
  /** Pages of rows, oldest first; reading stops at `maxRows` */
  pages: () => AsyncIterable<readonly Record<string, unknown>[]>;
  maxRows: number;
  /** Shown in README.txt when the file reached `maxRows` */
  truncatedNote?: string;
}

export type ExportEntry = JsonExportEntry | CsvExportEntry;

export interface ExportFileSummary {
  path: string;
  title: string;
  description: string;
  /** Records in the file (null for a single JSON object) */
  records: number | null;
  truncated: boolean;
  truncatedNote?: string;
}

/**
 * Keys that never leave the server, at any depth: credentials, token and
 * password hashes. The queries already select allowlisted columns; this is a
 * second line for JSON columns (snapshots, page content, metadata).
 */
const SECRET_KEYS = new Set(
  [
    "password",
    "passwordHash",
    "secret",
    "clientSecret",
    "clientSecretHash",
    "token",
    "accessToken",
    "refreshToken",
    "idToken",
    "accessTokenHash",
    "refreshTokenHash",
    "apiKey",
    "webhookSecret",
    "signingSecret",
  ].map((key) => key.toLowerCase()),
);

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key.replace(/[_-]/g, "").toLowerCase());
}

/** Deep copy without secret keys; dates become ISO strings. */
export function stripSecrets(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !isSecretKey(key))
        .map(([key, item]) => [key, stripSecrets(item)]),
    );
  }
  return typeof value === "bigint" ? value.toString() : value;
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === "object") text = JSON.stringify(value);
  else text = String(value);
  // Spreadsheet formula injection: visitor-supplied values stay plain text.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvLine(values: readonly unknown[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}

export function renderReadme({
  intro,
  generatedAt,
  files,
}: {
  intro: string;
  generatedAt: Date;
  files: readonly ExportFileSummary[];
}): string {
  const lines = [
    intro.trim(),
    "",
    `Generated: ${generatedAt.toISOString()}`,
    "",
    "Files",
    "-----",
  ];
  for (const file of files) {
    lines.push("", `${file.path} - ${file.title}`);
    lines.push(`  ${file.description}`);
    if (file.records !== null) {
      lines.push(
        `  ${file.records.toLocaleString("en")} ${file.records === 1 ? "record" : "records"}${file.truncated ? " (limit reached)" : ""}.`,
      );
    }
    if (file.truncated) {
      lines.push(
        `  ${file.truncatedNote ?? "This file stops at the export limit."}`,
      );
    }
  }
  lines.push(
    "",
    "Times are UTC (ISO 8601). Secrets are never exported: no passwords, password",
    "hashes, sign-in tokens, API or webhook secrets, or integration tokens. Scans",
    "and form responses carry a salted visitor hash, never an IP address.",
    "",
  );
  return lines.join("\n");
}

const encoder = new TextEncoder();

/** JSON entries loading at once. */
const JSON_LOOKAHEAD = 4;

interface ZipWriter {
  file(path: string): { push(text: string): void; end(): void };
  end(): void;
  drain(): Uint8Array[];
}

function zipWriter(mtime: Date): ZipWriter {
  const queue: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else queue.push(chunk);
  });
  const check = () => {
    if (failure) throw failure;
  };
  return {
    file(path) {
      const stream = new ZipDeflate(path, { level: 6 });
      stream.mtime = mtime;
      zip.add(stream);
      return {
        push: (text) => {
          if (text) stream.push(encoder.encode(text));
          check();
        },
        end: () => {
          stream.push(new Uint8Array(0), true);
          check();
        },
      };
    },
    end() {
      zip.end();
      check();
    },
    drain: () => queue.splice(0),
  };
}

interface ArchiveOptions {
  entries: readonly ExportEntry[];
  intro: string;
  generatedAt: Date;
  /** Epoch ms after which CSV files stop early (marked as cut short) */
  deadline?: number;
}

async function* archiveChunks({
  entries,
  intro,
  generatedAt,
  deadline,
}: ArchiveOptions): AsyncGenerator<Uint8Array> {
  const zip = zipWriter(generatedAt);
  const files: ExportFileSummary[] = [];

  // JSON files load a few ahead, so the queries overlap with compression.
  const loads = new Map<number, Promise<unknown>>();
  const prefetch = (index: number) => {
    const entry = entries[index];
    if (entry?.kind !== "json" || loads.has(index)) return;
    const load = entry.load();
    load.catch(() => {}); // Rethrown when awaited below.
    loads.set(index, load);
  };

  for (const [index, entry] of entries.entries()) {
    for (let ahead = index; ahead < index + JSON_LOOKAHEAD; ahead++) {
      prefetch(ahead);
    }
    const file = zip.file(entry.path);
    const summary: ExportFileSummary = {
      path: entry.path,
      title: entry.title,
      description: entry.description,
      records: null,
      truncated: false,
    };

    if (entry.kind === "json") {
      const data = stripSecrets(await loads.get(index));
      loads.delete(index);
      summary.records = Array.isArray(data) ? data.length : null;
      file.push(`${JSON.stringify(data, null, 2)}\n`);
    } else {
      file.push(csvLine(entry.columns));
      let rows = 0;
      for await (const page of entry.pages()) {
        if (page.length === 0) continue;
        const room = entry.maxRows - rows;
        if (room <= 0) {
          // A row beyond the limit exists.
          summary.truncated = true;
          break;
        }
        const slice = page.slice(0, room);
        file.push(
          slice
            .map((row) => csvLine(entry.columns.map((column) => row[column])))
            .join(""),
        );
        rows += slice.length;
        yield* zip.drain();
        // Out of rows, or out of time (the rest would not arrive anyway).
        if (page.length > room || (deadline && Date.now() > deadline)) {
          summary.truncated = true;
          break;
        }
      }
      summary.records = rows;
      if (summary.truncated) summary.truncatedNote = entry.truncatedNote;
    }

    file.end();
    files.push(summary);
    yield* zip.drain();
  }

  const readme = zip.file("README.txt");
  readme.push(renderReadme({ intro, generatedAt, files }));
  readme.end();
  zip.end();
  yield* zip.drain();
}

/** The ZIP as a byte stream; pulls (and queries) only as fast as it is read. */
export function exportArchiveStream(
  options: ArchiveOptions & { onError?: (error: unknown) => void },
): ReadableStream<Uint8Array> {
  const chunks = archiveChunks(options);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        options.onError?.(error);
        controller.error(error);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}
