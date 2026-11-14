// The snapshot of lib/product-facts.ts that another app (the docs site) reads
// through @repo/config/facts. scripts/facts-snapshot.ts writes it
// (`bun run --filter app facts:snapshot`) right before that app builds; it
// isn't committed, so it's always made from the current code.

import type { FactsSnapshot } from "@repo/config/facts";
import { PRODUCT_FACTS, STYLE_SUMMARY } from "@/lib/product-facts";

/** Keys in code point order, so the file's layout doesn't depend on source order. */
const sortedKeys = <T extends object>(record: T): T =>
  Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)),
  ) as T;

/** The snapshot's contents: two-space JSON with a trailing newline. */
export function productFactsSnapshot(): string {
  const snapshot: FactsSnapshot & { $comment: string } = {
    $comment:
      "Written by `bun run --filter app facts:snapshot` from apps/app/lib/product-facts.ts before the docs site builds. Not committed.",
    facts: sortedKeys(PRODUCT_FACTS),
    styleSummary: STYLE_SUMMARY,
  };
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}
