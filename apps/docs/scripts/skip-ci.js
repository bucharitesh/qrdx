// Vercel's "Ignored Build Step" (apps/docs/vercel.json ignoreCommand).
// Exit 0 skips the build, exit 1 builds.
//
// Production (main) and staging always build. Every other branch is a
// pull request preview, and those are skipped: the project runs on Vercel
// Hobby, where a day of agent branches used up the deployment budget and a
// production build was missed (2026-11-05). Previews were rarely opened
// anyway, since review happens locally.
//
// To build a preview on purpose, put [preview] in the commit message.
// [skip ci] still skips any build, production included.
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
  if (message.includes("[preview]")) {
    return {
      skip: false,
      reason: "Building this preview: [preview] in the commit message.",
    };
  }
  return {
    skip: true,
    reason: `Skipping the preview for ${branch || "this branch"}: only main and staging build. Put [preview] in a commit message to build one.`,
  };
}

module.exports = { shouldSkip };
