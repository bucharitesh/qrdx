// Vercel's "Ignored Build Step" (apps/docs/vercel.json ignoreCommand).
// Exit 0 skips the build, exit 1 builds.
//
// Production (main) and staging always build. Every other branch is a
// pull request preview, and those are skipped: the project runs on Vercel
// Hobby, where a day of agent branches used up the deployment budget and a
// production build was missed (2026-11-05). Previews were rarely opened
// anyway, since review happens locally.
//
// Skipped builds still count as deployments, and on 2026-11-11 agent pushes
// hit the daily cap again. So apps/docs/vercel.json (git.deploymentEnabled)
// now stops Vercel from creating a deployment at all for any branch other
// than main, staging and preview/**. This script is the second line: it
// only sees those branches.
//
// To build a preview on purpose, push the work to a branch named
// preview/<something>. [skip ci] still skips any build, production included.
//
// A change to the docs site alone (apps/docs-site, its deploy workflow) is
// skipped too, production included: that app deploys from its own GitHub
// Action (.github/workflows/docs-deploy.yml), and nothing here uses it. The
// changes are the ones since the last deployment (VERCEL_GIT_PREVIOUS_SHA);
// when git can't list them, the build goes ahead.
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

/** Files only the docs site uses: its app and its deploy workflow. */
const DOCS_SITE_ONLY = [
  /^apps\/docs-site\//,
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
        "Skipping: only the docs site changed (apps/docs-site deploys from .github/workflows/docs-deploy.yml).",
    };
  }
  if (env === "production") {
    return { skip: false, reason: "Building production." };
  }
  if (branch === "staging") {
    return { skip: false, reason: "Building staging." };
  }
  if (branch?.startsWith("preview/")) {
    return {
      skip: false,
      reason: `Building this preview: ${branch} is a preview/ branch.`,
    };
  }
  return {
    skip: true,
    reason: `Skipping the preview for ${branch || "this branch"}: only main, staging and preview/ branches build. Push to a preview/<name> branch to build one.`,
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
