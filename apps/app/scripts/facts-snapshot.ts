// Writes packages/config/facts.generated.json, the snapshot of
// lib/product-facts.ts that another app (the docs site) reads through
// @repo/config/facts:
//
//   bun run --filter app facts:snapshot
//
// The docs site runs it before it builds. The file isn't committed
// (.gitignore), so nobody has to remember to refresh it.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { FACTS_SNAPSHOT_FILE } from "@repo/config/facts";
import { productFactsSnapshot } from "@/lib/product-facts-snapshot";

const repo = path.resolve(import.meta.dirname, "../../..");
writeFileSync(path.join(repo, FACTS_SNAPSHOT_FILE), productFactsSnapshot());
console.log(`Wrote ${FACTS_SNAPSHOT_FILE}.`);
