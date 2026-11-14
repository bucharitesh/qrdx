// Writes the ESM type entry of each export (the `.d.mts` its "import"
// condition names) as a re-export of the `.d.ts` beside it. The package has
// no "type" field, so TypeScript reads every `.d.ts` as CommonJS; without an
// `.d.mts`, an ESM import under node16/nodenext gets CommonJS types for the
// `.mjs` it loads. The declarations stay in one tree, so both conditions
// share the same types.
//
//   node scripts/esm-types.mjs
//
// The build runs it after tsc, which writes the `.d.ts` files.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const DEFAULT_EXPORT = /^export (?:default\b|=|\{[^}]*\bas default\b)/m;

const missing = [];
let written = 0;
for (const [entry, conditions] of Object.entries(pkg.exports)) {
  const types = conditions?.import?.types;
  if (!types?.endsWith(".d.mts")) continue;
  const declaration = types.replace(/\.d\.mts$/, ".d.ts");
  if (!existsSync(new URL(declaration, root))) {
    missing.push(`${entry}: ${declaration}`);
    continue;
  }
  // `export *` leaves a default export out.
  if (DEFAULT_EXPORT.test(readFileSync(new URL(declaration, root), "utf8"))) {
    throw new Error(`${declaration} has a default export; re-export it too`);
  }
  const target = `./${basename(declaration, ".d.ts")}.js`;
  writeFileSync(
    fileURLToPath(new URL(types, root)),
    `export * from "${target}";\n`
  );
  written += 1;
}

if (missing.length > 0) {
  throw new Error(
    `No .d.ts to re-export (run tsc first):\n  ${missing.join("\n  ")}`
  );
}
console.log(`esm-types: wrote ${written} .d.mts files`);
