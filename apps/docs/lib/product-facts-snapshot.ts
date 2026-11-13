// The snapshot of lib/product-facts.ts that @repo/config/facts reads, for
// apps that can't import this one (the docs site). scripts/facts-snapshot.ts
// writes it (`bun run --filter docs facts:snapshot`) and
// tests/lib/product-facts-snapshot.test.ts fails while the committed copy
// differs from what this returns.

import { PRODUCT_FACTS, STYLE_SUMMARY } from "@/lib/product-facts";

/** Where the snapshot lives, from the repository root. */
export const FACTS_SNAPSHOT_FILE = "packages/config/facts.generated.json";

/** Keys in code point order, so moving a fact in the source doesn't churn the file. */
const sortedKeys = <T extends object>(record: T): T =>
  Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)),
  ) as T;

/** The file's contents: two-space JSON with a trailing newline. */
export function productFactsSnapshot(): string {
  const snapshot = {
    $comment:
      "Written by `bun run --filter docs facts:snapshot` from apps/docs/lib/product-facts.ts. Don't edit it by hand.",
    facts: sortedKeys(PRODUCT_FACTS),
    styleSummary: STYLE_SUMMARY,
  };
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}
