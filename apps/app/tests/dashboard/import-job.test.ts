// The CSV import as a resumable job (app/(app)/dashboard/codes/import/_lib/job.ts):
// fixed chunks, one idempotency key per chunk, progress that survives a
// reload (the job round-trips through structured clone, as IndexedDB
// stores it), failed chunks that go back in the queue, and a results CSV
// with every row of the file.
import { describe, expect, it } from "vitest";
import type { ImportRowInput } from "@/app/(app)/dashboard/codes/import/_lib/csv";
import {
  chunkRowsOf,
  chunkStartsFor,
  createdCodes,
  createImportJob,
  type ImportJob,
  idempotencyKeyFor,
  jobProgress,
  nextChunk,
  readImportJob,
  resultRows,
  withChunkDone,
  withChunkFailed,
  withFailedRetried,
} from "@/app/(app)/dashboard/codes/import/_lib/job";

const row = (line: number, destination = `https://example.com/${line}`) =>
  ({
    line,
    destination,
    title: `Row ${line}`,
    folder: "",
    tags: "",
    slug: "",
  }) satisfies ImportRowInput;

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => row(i + 2));

function job(count: number, maxRows = 500): ImportJob {
  return createImportJob({
    id: "job-1",
    fileName: "products.csv",
    rows: rows(count),
    skipped: [{ line: 1_000_000, destination: "nope", message: "Bad URL" }],
    domainId: null,
    folder: { id: "f1", name: "Spring" },
    tags: [],
    maxRows,
    maxBytes: 1024 * 1024,
    now: 0,
  });
}

/** What the server answers for a chunk: every row created. */
const created = (input: ImportRowInput[]) =>
  input.map((item) => ({
    line: item.line,
    ok: true,
    code: {
      id: `id-${item.line}`,
      slug: `s${item.line}`,
      shortLink: `https://qrdx.dev/q/s${item.line}`,
    },
  }));

describe("import jobs", () => {
  it("splits 10,000 rows into 20 fixed chunks with their own keys", () => {
    const big = job(10_000);
    expect(big.chunkStarts).toHaveLength(20);
    expect(chunkRowsOf(big, 0)).toHaveLength(500);
    expect(chunkRowsOf(big, 19).at(-1)?.line).toBe(10_001);
    expect(idempotencyKeyFor(big, 3)).toBe("import:job-1:3");
    expect(
      new Set(big.chunkStarts.map((_, i) => idempotencyKeyFor(big, i))).size,
    ).toBe(20);
  });

  it("starts a new chunk before a body would pass the byte budget", () => {
    const long = [
      row(2, `https://example.com/${"x".repeat(900)}`),
      row(3),
      row(4),
    ];
    expect(chunkStartsFor(long, { maxRows: 500, maxBytes: 1000 })).toEqual([
      0, 1,
    ]);
    expect(chunkStartsFor([], { maxRows: 5, maxBytes: 10 })).toEqual([]);
  });

  it("resumes after a reload where it stopped", () => {
    let current = job(1200);
    expect(nextChunk(current)).toBe(0);
    current = withChunkDone(current, 0, created(chunkRowsOf(current, 0)), null);
    // The page reloads: IndexedDB hands back a structured clone.
    const restored = readImportJob(structuredClone(current));
    expect(restored).not.toBeNull();
    expect(nextChunk(restored as ImportJob)).toBe(1);
    expect(jobProgress(restored as ImportJob)).toMatchObject({
      total: 1200,
      sent: 500,
      created: 500,
      pendingChunks: 2,
    });
  });

  it("drops saved jobs of another shape", () => {
    expect(readImportJob(null)).toBeNull();
    expect(readImportJob({ ...job(3), version: 0 })).toBeNull();
    expect(readImportJob({ ...job(3), chunks: [] })).toBeNull();
  });

  it("queues failed chunks again on retry, and counts their rows", () => {
    let current = job(1200);
    current = withChunkDone(current, 0, created(chunkRowsOf(current, 0)), null);
    current = withChunkFailed(current, 1, "connection lost");
    current = withChunkDone(current, 2, created(chunkRowsOf(current, 2)), null);
    expect(nextChunk(current)).toBe(-1);
    expect(jobProgress(current)).toMatchObject({
      sent: 700,
      failedRows: 500,
      failedChunks: 1,
    });
    const retried = withFailedRetried(current);
    expect(nextChunk(retried)).toBe(1);
    expect(retried.status).toBe("running");
    // The same chunk, the same key: the server returns what it made.
    expect(idempotencyKeyFor(retried, 1)).toBe(idempotencyKeyFor(current, 1));
  });

  it("lists every row of the file in the results, in file order", () => {
    let current = job(3);
    current = withChunkDone(
      current,
      0,
      [
        ...created(chunkRowsOf(current, 0).slice(0, 2)),
        { line: 4, ok: false, message: "unsafe" },
      ],
      { fgColor: "#111111" } as never,
    );
    expect(resultRows(current)).toEqual([
      expect.objectContaining({
        row: 2,
        status: "created",
        short_link: "https://qrdx.dev/q/s2",
      }),
      expect.objectContaining({ row: 3, status: "created" }),
      expect.objectContaining({ row: 4, status: "failed", message: "unsafe" }),
      expect.objectContaining({
        row: 1_000_000,
        status: "skipped",
        message: "Bad URL",
      }),
    ]);
    expect(createdCodes(current).map((code) => code.slug)).toEqual([
      "s2",
      "s3",
    ]);
    expect(current.style).toEqual({ fgColor: "#111111" });
  });
});
