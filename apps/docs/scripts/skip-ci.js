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
const { execSync } = require("node:child_process");

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
  });
  console.log(decision.reason);
  process.exit(decision.skip ? 0 : 1);
}

/** Whether to skip this build, and why (pure, for the test). */
function shouldSkip({ message, env, branch }) {
  if (message.includes("[skip ci]")) {
    return { skip: true, reason: "Skipping: [skip ci] in the commit message." };
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

module.exports = { shouldSkip };
