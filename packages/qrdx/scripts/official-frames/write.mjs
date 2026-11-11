// Writes QRdx's generated official frames and the catalogue modules.
//
//   pnpm --filter qrdx build:inplace                  (the checks use dist/types)
//   node scripts/official-frames/write.mjs            write frames + modules
//   node scripts/official-frames/write.mjs --check    exit 1 if anything is stale
//
// 1. Every entry in catalogue.mjs is drawn from its layout (layouts.mjs) and
//    motifs (motifs.mjs), checked (build.mjs) and written to
//    src/frames/official/<id>.json. The frames that were made by hand (see
//    HAND_MADE in modules.mjs) are never written here.
// 2. modules.mjs then writes the TypeScript modules that load those files
//    (the full list, one module per collection, a light index and counts).
//
// Frame ids are permanent: they are links (/community/frames/<id>), seeded
// database slugs and playground link values. Never rename or reuse one.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { make } from "./build.mjs";
import { ENTRIES } from "./catalogue.mjs";
import { HAND_MADE, writeModules } from "./modules.mjs";

const check = process.argv.includes("--check");
const dir = fileURLToPath(
  new URL("../../src/frames/official/", import.meta.url)
);

const ids = new Set(HAND_MADE);
const stale = [];
const specs = new Map();
let failed = 0;
for (const entry of ENTRIES) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
    throw new Error(`${entry.id}: ids are kebab-case`);
  }
  if (ids.has(entry.id)) throw new Error(`${entry.id}: id used twice`);
  ids.add(entry.id);
  const { frame, problems } = make(entry);
  const specJson = JSON.stringify(frame.spec);
  if (specs.has(specJson)) {
    problems.push(`draws the same as ${specs.get(specJson)}`);
  }
  specs.set(specJson, entry.id);
  if (problems.length > 0) {
    failed += 1;
    console.error(`${entry.id}:\n  ${problems.join("\n  ")}`);
    continue;
  }
  const file = `${dir}${entry.id}.json`;
  const json = `${JSON.stringify(frame, null, 2)}\n`;
  let before = null;
  try {
    before = readFileSync(file, "utf8");
  } catch {
    // A new frame
  }
  // Compare as data, so formatting by biome doesn't count as a change
  if (
    before === null ||
    JSON.stringify(JSON.parse(before)) !== JSON.stringify(frame)
  ) {
    stale.push(entry.id);
    if (!check) writeFileSync(file, json);
  }
}
if (failed > 0) {
  console.error(
    `${failed} frame(s) failed their checks; nothing else was written.`
  );
  process.exit(1);
}
const modules = writeModules({ check });
stale.push(...modules);
if (check && stale.length > 0) {
  console.error(
    `Stale: ${stale.join(", ")}. Run node scripts/official-frames/write.mjs`
  );
  process.exit(1);
}
console.log(
  check
    ? `${ENTRIES.length + HAND_MADE.length} official frames, up to date.`
    : `${ENTRIES.length} generated frames checked; ${stale.length} file(s) written.`
);
