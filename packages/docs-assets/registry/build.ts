/**
 * Writes the shadcn/ui registry (outputs.ts) to a folder, where an app serves
 * it as /r/<name>.json. The main app keeps its copy in apps/app/public/r:
 *
 *   bun run --filter app registry:build             (writes public/r)
 *   bun run --filter app registry:build -- --check  (exits non-zero when stale)
 *
 * which runs: tsx ../../packages/docs-assets/registry/build.ts --out public/r
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isCurrent, registryOutputs } from "./outputs";

const root = path.join(__dirname, "..");
const outFlag = process.argv.indexOf("--out");
const out = outFlag === -1 ? undefined : process.argv[outFlag + 1];
if (!out) {
  console.error("Pass the folder to write: --out <dir> (e.g. public/r).");
  process.exit(1);
}
const outDir = path.resolve(out);

const outputs = registryOutputs(root);
const check = process.argv.includes("--check");
const stale: string[] = [];

for (const [name, data] of outputs) {
  const file = path.join(outDir, name);
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  if (isCurrent(current, data)) continue;
  if (check) {
    stale.push(path.relative(process.cwd(), file));
  } else {
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`wrote ${path.relative(process.cwd(), file)}`);
  }
}

if (check) {
  if (stale.length > 0) {
    console.error(
      `Registry is out of date: ${stale.join(", ")}\nRun: bun run --filter app registry:build`,
    );
    process.exit(1);
  }
  console.log(`Registry is up to date (${outputs.size - 1} items).`);
} else {
  // Ultracite is installed at the repository root.
  spawnSync(
    path.join(root, "..", "..", "node_modules/.bin/ultracite"),
    ["fix", outDir],
    { stdio: "inherit" },
  );
}
