// Vercel's "Ignored Build Step" (apps/docs/vercel.json ignoreCommand).
// Exit 0 skips the build, exit 1 builds.
//
// Only production (main) builds. The project runs on Vercel Hobby, whose
// build and CPU allowances are tight, so previews and staging don't deploy
// at all (owner, 2026-11-14): apps/docs/vercel.json (git.deploymentEnabled)
// stops Vercel from creating a deployment for any branch but main, and this
// script is the second line in case a non-production build reaches it.
// Review happens locally (bun run --filter docs dev); CI runs the typechecks,
// tests and lint. [skip ci] still skips any build, production included.
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
  return {
    skip: true,
    reason: `Skipping ${branch || "this branch"}: only production (main) builds on Vercel.`,
  };
}

module.exports = { shouldSkip };
