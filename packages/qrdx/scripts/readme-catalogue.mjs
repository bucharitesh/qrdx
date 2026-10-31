// Keeps the option lists in the qrdx and @qrdx/cli READMEs in step with the
// engine's catalogue. Each list sits between markers named after the export
// it comes from:
//   <!-- catalogue:BODY_PATTERN -->`circle`, `square`<!-- /catalogue -->
//
//   node scripts/readme-catalogue.mjs          rewrite the lists
//   node scripts/readme-catalogue.mjs --check  exit 1 if a list is stale
//
// It reads the built qrdx/types entry, so build qrdx first.
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

const READMES = ["../README.md", "../../cli/README.md"].map((path) =>
  fileURLToPath(new URL(path, import.meta.url))
);
const MARKER = /<!-- catalogue:(\w+) -->[\s\S]*?<!-- \/catalogue -->/g;
const check = process.argv.includes("--check");

let catalogue;
try {
  catalogue = await import("../dist/types/index.mjs");
} catch (error) {
  throw new Error(
    `Could not load qrdx/types from dist. Build qrdx first. (${error.message})`
  );
}

const stale = [];
for (const file of READMES) {
  const name = relative(process.cwd(), file);
  const before = readFileSync(file, "utf8");
  let markers = 0;
  const after = before.replace(MARKER, (_, list) => {
    const values = catalogue[list];
    if (!Array.isArray(values)) {
      throw new Error(`${name}: qrdx/types has no list named ${list}`);
    }
    markers += 1;
    const items = values.map((value) => `\`${value}\``).join(", ");
    return `<!-- catalogue:${list} -->${items}<!-- /catalogue -->`;
  });
  if (markers === 0) {
    throw new Error(`${name}: no <!-- catalogue:… --> markers found`);
  }
  if (after === before) {
    continue;
  }
  if (check) {
    stale.push(name);
  } else {
    writeFileSync(file, after);
    console.log(`Updated the option lists in ${name}`);
  }
}

if (stale.length > 0) {
  console.error(
    `Option lists are out of date in ${stale.join(" and ")}. Run: pnpm --filter qrdx readme`
  );
  process.exitCode = 1;
}
