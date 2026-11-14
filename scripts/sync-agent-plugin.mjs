#!/usr/bin/env node
// Copies the canonical generate-qr skill (skills/generate-qr) into the agent
// plugin (plugins/agent/skills/generate-qr). Plugin directories and
// marketplaces refuse symlinks, so the plugin carries a real copy; skill
// indexes and listings link to skills/generate-qr, so that one stays the
// source. Run it after every change to the skill:
//
//   bun run sync:agent-plugin                    write the copy
//   node scripts/sync-agent-plugin.mjs --check   exit 1 if the copy differs
//
// apps/app/tests/repo/agent-plugin.test.ts runs --check.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "skills", "generate-qr");
const target = join(root, "plugins", "agent", "skills", "generate-qr");

// macOS and Windows folder metadata, which directories refuse in a plugin.
const IGNORED = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** Every file under `dir`, as paths relative to it. */
function listFiles(dir, base = dir) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED.has(entry.name)) {
      return [];
    }
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path, base) : [relative(base, path)];
  });
}

const sourceFiles = listFiles(source).sort();
const targetFiles = listFiles(target).sort();

const changed = sourceFiles.filter((file) => {
  const copy = join(target, file);
  return !(
    existsSync(copy) &&
    readFileSync(copy).equals(readFileSync(join(source, file)))
  );
});
const extra = targetFiles.filter((file) => !sourceFiles.includes(file));

if (process.argv.includes("--check")) {
  if (changed.length > 0 || extra.length > 0) {
    console.error(
      [
        "plugins/agent/skills/generate-qr differs from skills/generate-qr:",
        ...changed.map((file) => `  changed or missing: ${file}`),
        ...extra.map((file) => `  not in skills/generate-qr: ${file}`),
        "Run: bun run sync:agent-plugin",
      ].join("\n")
    );
    process.exit(1);
  }
  console.log(
    `plugins/agent/skills/generate-qr matches skills/generate-qr (${sourceFiles.length} files).`
  );
} else {
  for (const file of changed) {
    mkdirSync(dirname(join(target, file)), { recursive: true });
    writeFileSync(join(target, file), readFileSync(join(source, file)));
    console.log(`copied ${file}`);
  }
  for (const file of extra) {
    rmSync(join(target, file));
    console.log(`removed ${file}`);
  }
  if (changed.length === 0 && extra.length === 0) {
    console.log("Already in sync.");
  }
}
