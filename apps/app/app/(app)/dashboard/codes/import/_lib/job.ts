// A CSV import as a resumable job: the rows to create, split into chunks
// that are sent one request at a time, and what each chunk returned. The
// wizard keeps the job in IndexedDB (job-store.ts) after every chunk, so a
// reload or a closed tab resumes where it stopped; each chunk has its own
// idempotency key, so a chunk sent twice (in flight at the reload, retried
// after a network error) never makes its codes twice. Pure functions only:
// tests/dashboard/import-job.test.ts covers them.
import type { ThemeStyles } from "@/types/theme";
import type { ImportIssue, ImportRowInput } from "./csv";

/** Bump when the stored shape changes: older saved jobs are dropped. */
export const IMPORT_JOB_VERSION = 1;

export type ChunkState = "pending" | "done" | "failed";

/** What a row came to (the server's ImportRowResult, plus the CSV line). */
export interface JobRowResult {
  line: number;
  ok: boolean;
  message?: string;
  /** Why the row wasn't imported, as codes (../_lib/csv.ts) */
  issues?: ImportIssue[];
  code?: { id: string; slug: string; shortLink: string };
}

export interface ImportJob {
  version: typeof IMPORT_JOB_VERSION;
  /** Random; with the chunk's index, the chunk's idempotency key */
  id: string;
  fileName: string;
  createdAt: number;
  domainId: string | null;
  /** The batch's folder and tags (for every row), with names to show */
  folder: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
  /** The rows to create, in file order */
  rows: ImportRowInput[];
  /** Rows the preview found problems with: never sent, listed in the results */
  skipped: { line: number; destination: string; message: string }[];
  /** Where each chunk starts in `rows` (fixed when the job is made) */
  chunkStarts: number[];
  chunks: ChunkState[];
  /** The last error of each failed chunk */
  chunkErrors: (string | null)[];
  /** By CSV line */
  results: Record<number, JobRowResult>;
  /** The design the codes got, for the images ZIP */
  style: ThemeStyles | null;
  /**
   * running: sending (or was, when the page closed); paused: by the user, or
   * with failed chunks to retry; done: finished or ended early.
   */
  status: "running" | "paused" | "done";
  /** Why the import stopped (the plan, an hourly limit), if it did */
  stopped: string | null;
  /**
   * Stopped by a limit that lifts by itself (a new account's hourly cap):
   * when the rest can be sent (epoch ms). Absent in jobs saved before.
   */
  resumeAfter?: number | null;
}

/** Splits rows into chunks of at most `maxRows` rows and about `maxBytes`. */
export function chunkStartsFor(
  rows: ImportRowInput[],
  { maxRows, maxBytes }: { maxRows: number; maxBytes: number },
): number[] {
  const starts: number[] = [];
  let count = 0;
  let bytes = 0;
  rows.forEach((row, index) => {
    const size = JSON.stringify(row).length;
    if (index === 0 || count >= maxRows || bytes + size > maxBytes) {
      starts.push(index);
      count = 0;
      bytes = 0;
    }
    count++;
    bytes += size;
  });
  return starts;
}

export function createImportJob(input: {
  id: string;
  fileName: string;
  rows: ImportRowInput[];
  skipped: ImportJob["skipped"];
  domainId: string | null;
  folder: ImportJob["folder"];
  tags: ImportJob["tags"];
  maxRows: number;
  maxBytes: number;
  now?: number;
}): ImportJob {
  const chunkStarts = chunkStartsFor(input.rows, input);
  return {
    version: IMPORT_JOB_VERSION,
    id: input.id,
    fileName: input.fileName,
    createdAt: input.now ?? Date.now(),
    domainId: input.domainId,
    folder: input.folder,
    tags: input.tags,
    rows: input.rows,
    skipped: input.skipped,
    chunkStarts,
    chunks: chunkStarts.map(() => "pending"),
    chunkErrors: chunkStarts.map(() => null),
    results: {},
    style: null,
    status: "running",
    stopped: null,
  };
}

/** A saved job, if it's one this version can resume. */
export function readImportJob(value: unknown): ImportJob | null {
  if (!value || typeof value !== "object") return null;
  const job = value as Partial<ImportJob>;
  return job.version === IMPORT_JOB_VERSION &&
    Array.isArray(job.rows) &&
    Array.isArray(job.chunks) &&
    Array.isArray(job.chunkStarts) &&
    job.chunks.length === job.chunkStarts.length
    ? (job as ImportJob)
    : null;
}

export function chunkRowsOf(job: ImportJob, index: number): ImportRowInput[] {
  const start = job.chunkStarts[index] ?? job.rows.length;
  const end = job.chunkStarts[index + 1] ?? job.rows.length;
  return job.rows.slice(start, end);
}

/** The next chunk to send; -1 when none is pending. */
export const nextChunk = (job: ImportJob): number =>
  job.chunks.indexOf("pending");

export const idempotencyKeyFor = (job: ImportJob, index: number): string =>
  `import:${job.id}:${index}`;

export function withChunkDone(
  job: ImportJob,
  index: number,
  rows: JobRowResult[],
  style: ThemeStyles | null,
): ImportJob {
  const chunks = [...job.chunks];
  chunks[index] = "done";
  const chunkErrors = [...job.chunkErrors];
  chunkErrors[index] = null;
  const results = { ...job.results };
  for (const row of rows) results[row.line] = row;
  return { ...job, chunks, chunkErrors, results, style: job.style ?? style };
}

export function withChunkFailed(
  job: ImportJob,
  index: number,
  message: string,
): ImportJob {
  const chunks = [...job.chunks];
  chunks[index] = "failed";
  const chunkErrors = [...job.chunkErrors];
  chunkErrors[index] = message;
  return { ...job, chunks, chunkErrors };
}

/** Failed chunks go back in the queue. */
export function withFailedRetried(job: ImportJob): ImportJob {
  return {
    ...job,
    chunks: job.chunks.map((state) => (state === "failed" ? "pending" : state)),
    status: "running",
    stopped: null,
    resumeAfter: null,
  };
}

export interface JobProgress {
  total: number;
  /** Rows in chunks the server answered */
  sent: number;
  created: number;
  /** Rows the server didn't create (a row problem) */
  rowErrors: number;
  /** Rows in chunks that failed to send */
  failedRows: number;
  failedChunks: number;
  pendingChunks: number;
}

export function jobProgress(job: ImportJob): JobProgress {
  let sent = 0;
  let failedRows = 0;
  job.chunks.forEach((state, index) => {
    const size = chunkRowsOf(job, index).length;
    if (state === "done") sent += size;
    if (state === "failed") failedRows += size;
  });
  const results = Object.values(job.results);
  return {
    total: job.rows.length,
    sent,
    created: results.filter((row) => row.ok).length,
    rowErrors: results.filter((row) => !row.ok).length,
    failedRows,
    failedChunks: job.chunks.filter((state) => state === "failed").length,
    pendingChunks: job.chunks.filter((state) => state === "pending").length,
  };
}

/** The results CSV: one line per row of the file. */
export function resultRows(job: ImportJob): Record<string, string | number>[] {
  const rows = [
    ...job.rows.map((row) => {
      const result = job.results[row.line];
      return {
        row: row.line,
        short_link: result?.code?.shortLink ?? "",
        status: result ? (result.ok ? "created" : "failed") : "not sent",
        title: row.title,
        destination: row.destination,
        message: result?.message ?? "",
      };
    }),
    ...job.skipped.map((row) => ({
      row: row.line,
      short_link: "",
      status: "skipped",
      title: "",
      destination: row.destination,
      message: row.message,
    })),
  ];
  return rows.sort((a, b) => a.row - b.row);
}

/** Created codes with what an image needs, in file order. */
export function createdCodes(job: ImportJob) {
  return job.rows.flatMap((row) => {
    const code = job.results[row.line]?.code;
    return code ? [{ ...code, title: row.title || null }] : [];
  });
}
