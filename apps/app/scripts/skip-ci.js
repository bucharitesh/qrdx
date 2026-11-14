// Vercel's "Ignored Build Step" (apps/app/vercel.json ignoreCommand).
// Exit 0 skips the build, exit 1 builds.
//
// Only production (main) builds. The project runs on Vercel Hobby, whose
// build and CPU allowances are tight, so previews and staging don't deploy
// at all (owner, 2026-11-14): apps/app/vercel.json (git.deploymentEnabled)
// stops Vercel from creating a deployment for any branch but main, and this
// script is the second line in case a non-production build reaches it.
// Review happens locally (bun run --filter app dev); CI runs the typechecks,
// tests and lint. [skip ci] still skips any build, production included.
//
// A change to the docs site alone (apps/docs, its content in
// apps/docs/content included, and its deploy workflow) is skipped too: that
// app deploys from its own GitHub Action (.github/workflows/docs-deploy.yml),
// and nothing this app builds reads it. The changes are the ones since the
// last deployment (VERCEL_GIT_PREVIOUS_SHA); when git can't list them, the
// build goes ahead.
const { execFileSync, execSync } = require("node:child_process");
const path = require("node:path");

/**
 * The files changed since `previous` (paths from the repository root), or
 * null when there's no previous deployment or git can't tell (a shallow
 * clone that doesn't reach it).
 */
function changedFiles(previous) {
  if (!(previous && /^[0-9a-f]{7,40}$/i.test(previous))) return null;
  try {
    return execFileSync("git", ["diff", "--name-only", previous, "HEAD"], {
      cwd: path.join(__dirname, "..", "..", ".."),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .split("\n")
      .filter(Boolean);
  } catch {
    return null;
  }
}

/** Files only the docs site uses: its app, its content and its deploy workflow. */
const DOCS_SITE_ONLY = [
  /^apps\/docs\//,
  /^\.github\/workflows\/docs-deploy\.yml$/,
];

/** True when every changed file belongs to the docs site alone. */
function onlyDocsSite(files) {
  return (
    Array.isArray(files) &&
    files.length > 0 &&
    files.every((file) => DOCS_SITE_ONLY.some((pattern) => pattern.test(file)))
  );
}

/** Whether to skip this build, and why (pure, for the test). */
function shouldSkip({ message, env, branch, changedFiles: files = null }) {
  if (message.includes("[skip ci]")) {
    return { skip: true, reason: "Skipping: [skip ci] in the commit message." };
  }
  if (onlyDocsSite(files)) {
    return {
      skip: true,
      reason:
        "Skipping: only the docs site changed (apps/docs deploys from .github/workflows/docs-deploy.yml).",
    };
  }
  if (env === "production") {
    return { skip: false, reason: "Building production." };
  }
  return {
    skip: true,
    reason: `Skipping ${branch || "this branch"}: only production (main) builds on Vercel.`,
  };
}

if (require.main === module) {
  const commitMessage = (() => {
    try {
      return execSync("git log -1 --pretty=%B").toString().trim();
    } catch {
      return "";
    }
  })();
  const decision = shouldSkip({
    message: commitMessage,
    env: process.env.VERCEL_ENV,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
    changedFiles: changedFiles(process.env.VERCEL_GIT_PREVIOUS_SHA),
  });
  console.log(decision.reason);
  process.exit(decision.skip ? 0 : 1);
}

module.exports = { shouldSkip };
