// Writes packages/config/facts.generated.json, the snapshot of
// lib/product-facts.ts that @repo/config/facts serves to apps that can't
// import this one (the docs site):
//
//   bun run --filter docs facts:snapshot
//
// Run it after changing a product fact or anything one counts (the engine's
// catalogues, pricing, the affiliate terms, …) and commit the result;
// tests/lib/product-facts-snapshot.test.ts fails while it's stale.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  FACTS_SNAPSHOT_FILE,
  productFactsSnapshot,
} from "@/lib/product-facts-snapshot";

const repo = path.resolve(import.meta.dirname, "../../..");
const file = path.join(repo, FACTS_SNAPSHOT_FILE);
const next = productFactsSnapshot();

if (existsSync(file) && readFileSync(file, "utf8") === next) {
  console.log(`${FACTS_SNAPSHOT_FILE} is up to date.`);
} else {
  writeFileSync(file, next);
  console.log(`Wrote ${FACTS_SNAPSHOT_FILE}.`);
}
