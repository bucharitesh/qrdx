#!/usr/bin/env node
// Generates the docs app's route types (PageProps, LayoutProps,
// RouteContext) with `next typegen`, so `pnpm typecheck:docs` works in a
// fresh checkout or worktree. The pre-push hook runs it before the docs
// typecheck.
//
// next typegen only needs the env schema to validate. When the app has no
// .env.local (a fresh worktree, CI), this fills in the same placeholders CI
// uses, and only for variables that aren't already set. When .env.local
// exists, nothing is filled in and Next reads it as usual.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "apps", "docs");

// The placeholders .github/workflows/ci.yml sets. Nothing here connects to
// a database or service; typegen never does.
const PLACEHOLDERS = {
  DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "ci-placeholder-secret-not-used-for-anything-real",
};

const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
const filled = [];
if (!existsSync(join(docs, ".env.local"))) {
  for (const [name, value] of Object.entries(PLACEHOLDERS)) {
    if (!env[name]) {
      env[name] = value;
      filled.push(name);
    }
  }
}
if (filled.length > 0) {
  console.log(
    `typegen: no apps/docs/.env.local, using CI placeholders for ${filled.join(", ")}`
  );
}

const result = spawnSync(
  "pnpm",
  ["--filter", "docs", "exec", "next", "typegen"],
  { cwd: root, env, stdio: "inherit" }
);
process.exit(result.status ?? 1);
