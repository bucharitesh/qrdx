// Builds the package the way `n8n-node build` (@n8n/node-cli) does: empty
// dist/, compile with tsc, then copy the icons next to the compiled files.
// @n8n/node-cli itself isn't a dependency because it brings ~550 MB of
// packages (AI SDKs among them) into the monorepo for these three steps.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });

const tsc = spawnSync("tsc", ["-p", "tsconfig.json"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (tsc.status !== 0) {
  console.error("TypeScript build failed");
  process.exit(tsc.status ?? 1);
}

const assets = ["credentials", "nodes", "icons"].flatMap((folder) =>
  readdirSync(join(root, folder), { recursive: true })
    .map(String)
    .filter((file) => /\.(png|svg)$/.test(file))
    .map((file) => join(folder, file))
);
for (const file of assets) {
  const target = join(dist, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(root, file), target);
}
console.log(`Built dist/ and copied ${assets.length} icon files`);
