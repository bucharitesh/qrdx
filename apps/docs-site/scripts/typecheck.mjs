#!/usr/bin/env node
// `bun run typecheck` for the docs site (turbo runs it with every package's):
// writes what the build reads from the main app (zone-inputs.mjs), generates
// the route types (next typegen, which also writes the docs' content modules
// in .source while it loads next.config.ts), then runs tsc.
//
// next typegen loads next.config.ts, which validates the environment as a
// production build would. When the app has no .env.local (a fresh worktree,
// CI), typegen and tsc get placeholders for what's required, and only for
// variables that aren't already set; zone-inputs.mjs runs before them, with
// the real environment. Nothing connects to anything but MAIN_ZONE_URL, and
// only when it's really set.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");

const PLACEHOLDERS = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3001",
  MAIN_ZONE_URL: "http://localhost:3000",
};

const real = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
const placeheld = { ...real };
if (!existsSync(join(app, ".env.local"))) {
  for (const [name, value] of Object.entries(PLACEHOLDERS)) {
    if (!placeheld[name]) placeheld[name] = value;
  }
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: app, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("node", ["scripts/zone-inputs.mjs"], real);
run("bun", ["x", "next", "typegen"], placeheld);
run("bun", ["x", "tsc", "--noEmit"], placeheld);
