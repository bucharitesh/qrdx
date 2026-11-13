// Copies public/openapi.json, the REST API's OpenAPI document that
// `bun run openapi:generate` writes, to packages/docs-assets/openapi.json,
// where another app (the docs site) reads it as @repo/docs-assets/openapi.json:
//
//   bun run --filter docs openapi:export
//   bun run --filter docs openapi:export -- --out <file>   (somewhere else)
//
// The docs site runs it before it builds or starts. The copy isn't committed
// (.gitignore), so it can't go stale.
import { copyFileSync } from "node:fs";
import path from "node:path";

const app = path.resolve(import.meta.dirname, "..", "..");
const outFlag = process.argv.indexOf("--out");
const out =
  outFlag === -1
    ? path.join(app, "..", "..", "packages", "docs-assets", "openapi.json")
    : process.argv[outFlag + 1];
if (!out) {
  console.error("Pass the file to write: --out <file>.");
  process.exit(1);
}

const target = path.resolve(out);
copyFileSync(path.join(app, "public", "openapi.json"), target);
console.log(`Wrote ${path.relative(process.cwd(), target)}.`);
