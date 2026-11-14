// Helpers for creating many codes in one request (POST /v1/codes with an
// array, the dashboard's CSV import): chunked inserts, generated slugs that
// can't collide, and Idempotency-Key ids. No database access here, so the
// rules are unit-tested on their own (tests/api/bulk-create.test.ts).
import { createHash } from "node:crypto";
import { z } from "zod";
import { generateSlug } from "@/lib/short-links";

/** Splits `items` into runs of at most `maxRows` and about `maxBytes` each. */
export function chunkRows<T>(
  items: readonly T[],
  {
    maxRows,
    maxBytes = Number.POSITIVE_INFINITY,
    sizeOf = () => 0,
  }: { maxRows: number; maxBytes?: number; sizeOf?: (item: T) => number },
): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = sizeOf(item);
    if (
      current.length > 0 &&
      (current.length >= maxRows || bytes + size > maxBytes)
    ) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Rows per INSERT, and the rough size of one (a design with a logo is big). */
export const INSERT_CHUNK = { maxRows: 250, maxBytes: 2 * 1024 * 1024 };

/**
 * `count` generated slugs, distinct from each other and from every slug
 * `taken` reports (one call per round, with the round's candidates). Rerolls
 * the taken ones; 62^7 slugs make a second round rare and a sixth
 * practically impossible, which throws.
 */
export async function uniqueSlugs(
  count: number,
  taken: (candidates: string[]) => Promise<Set<string>>,
  generate: () => string = generateSlug,
  rounds = 5,
): Promise<string[]> {
  const slugs: (string | null)[] = Array.from({ length: count }, () => null);
  const used = new Set<string>();
  for (let round = 0; round < rounds; round++) {
    const open = slugs.flatMap((slug, index) => (slug ? [] : [index]));
    if (open.length === 0) break;
    const candidates = open.map(() => {
      let slug = generate();
      while (used.has(slug)) slug = generate();
      used.add(slug);
      return slug;
    });
    const busy = await taken(candidates);
    open.forEach((index, i) => {
      const slug = candidates[i] as string;
      if (!busy.has(slug)) slugs[index] = slug;
    });
  }
  if (slugs.some((slug) => !slug)) {
    throw new Error("Could not find free slugs");
  }
  return slugs as string[];
}

/**
 * The Idempotency-Key header: what a client sends so a retried request (after
 * a timeout or a dropped connection) doesn't create the codes twice.
 */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(1, "Idempotency-Key is empty")
  .max(255, "Idempotency-Key can be up to 255 characters")
  .regex(/^[\x21-\x7e]+$/, "Idempotency-Key must be printable ASCII")
  .describe(
    "A unique value per batch, such as a UUID. Retrying with the same key and the same codes returns the codes the first request created instead of creating them again; a request cut off part way is finished by its retry.",
  );

/**
 * The id a code gets when it's created under an Idempotency-Key: derived from
 * the workspace, the key, the row's place in the request and its content, so
 * a retry of the same request maps to the same rows (the primary key stops
 * any second insert) while a different request under the same key makes
 * different codes. Shaped like the cuids other codes get (25 characters,
 * starting with "c").
 */
export function idempotentCodeId(
  workspace: string,
  key: string,
  index: number,
  fingerprint: string,
): string {
  const digest = createHash("sha256")
    .update(`qrdx-code\0${workspace}\0${key}\0${index}\0${fingerprint}`)
    .digest();
  let id = "";
  for (const byte of digest) {
    if (id.length === 24) break;
    id += (byte % 36).toString(36);
  }
  return `c${id}`;
}

/** One row's problem in a batch, by its place in the request (0-based). */
export interface RowProblem {
  index: number;
  /** The field, as the validation errors write it: "3.slug" */
  path: string;
  message: string;
}

/** "3 of 1,000 codes …" summary for a batch error; one problem reads as itself. */
export function batchMessage(problems: RowProblem[], total: number): string {
  const [first] = problems;
  if (!first) return "Nothing was created.";
  if (total <= 1) return first.message;
  const rows = problems.length === 1 ? "code" : "codes";
  return `${problems.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} ${rows} can't be created (first: #${first.index}, ${first.message}). Nothing was created; data.details lists each one by index.`;
}
