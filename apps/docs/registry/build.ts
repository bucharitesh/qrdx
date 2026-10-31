/**
 * Builds the shadcn/ui registry served at https://qrdx.dev/r/<name>.json from
 * registry.json: one item per component with its source inlined (imports
 * rewritten for shadcn/ui projects), plus the registry index.
 *
 * Run from apps/docs:  pnpm exec tsx registry/build.ts [--check]
 * --check exits non-zero when public/r is out of date instead of writing it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toConsumerSource } from "./transform";

interface RegistryFile {
  path: string;
  type: string;
  content?: string;
}

interface RegistryItem {
  name: string;
  files: RegistryFile[];
  [key: string]: unknown;
}

const root = process.cwd();
const registryPath = path.join(root, "registry.json");
if (!existsSync(registryPath)) {
  console.error("Run this from apps/docs (registry.json not found).");
  process.exit(1);
}

const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
  items: RegistryItem[];
};
const outDir = path.join(root, "public/r");

const outputs = new Map<string, unknown>();
outputs.set(path.join(outDir, "registry.json"), registry);

for (const item of registry.items) {
  outputs.set(path.join(outDir, `${item.name}.json`), {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    ...item,
    files: item.files.map((file) => ({
      ...file,
      content: toConsumerSource(
        readFileSync(path.join(root, file.path), "utf8"),
      ),
    })),
  });
}

const check = process.argv.includes("--check");
const stale: string[] = [];

for (const [file, data] of outputs) {
  const current = existsSync(file) ? readFileSync(file, "utf8") : null;
  const same =
    current !== null &&
    JSON.stringify(JSON.parse(current)) === JSON.stringify(data);
  if (same) continue;
  if (check) {
    stale.push(path.relative(root, file));
  } else {
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`wrote ${path.relative(root, file)}`);
  }
}

if (check) {
  if (stale.length > 0) {
    console.error(
      `Registry is out of date: ${stale.join(", ")}\nRun: pnpm exec tsx registry/build.ts`,
    );
    process.exit(1);
  }
  console.log(`Registry is up to date (${registry.items.length} items).`);
} else {
  spawnSync(
    path.join(root, "node_modules/.bin/biome"),
    ["format", "--write", outDir],
    { stdio: "inherit" },
  );
}
