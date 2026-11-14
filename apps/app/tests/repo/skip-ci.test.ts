// Vercel's ignored build step (scripts/skip-ci.js): only production (main)
// builds; [skip ci] skips everything. Vercel doesn't create deployments for
// any other branch at all (vercel.json git.deploymentEnabled), which the last
// tests check.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { shouldSkip } = require("../../scripts/skip-ci.js") as {
  shouldSkip: (input: {
    message: string;
    env?: string;
    branch?: string;
    changedFiles?: string[] | null;
  }) => {
    skip: boolean;
    reason: string;
  };
};

describe("skip-ci", () => {
  it("builds production", () => {
    expect(
      shouldSkip({
        message: "Merge release",
        env: "production",
        branch: "main",
      }).skip,
    ).toBe(false);
  });

  it("skips staging and every preview", () => {
    for (const branch of ["staging", "preview/x", "feat/x"]) {
      expect(
        shouldSkip({ message: "feat: x", env: "preview", branch }).skip,
        branch,
      ).toBe(true);
    }
  });

  it("skips a change to the docs site alone, production included", () => {
    const production = {
      message: "Merge release",
      env: "production",
      branch: "main",
    };
    expect(
      shouldSkip({
        ...production,
        changedFiles: [
          "apps/docs-site/app/robots.ts",
          ".github/workflows/docs-deploy.yml",
        ],
      }).skip,
    ).toBe(true);
    // Anything else the main app might use builds.
    for (const changedFiles of [
      ["apps/docs-site/app/robots.ts", "apps/app/content/docs/index.mdx"],
      ["apps/docs-site/package.json", "bun.lock"],
      ["packages/i18n/docs.ts"],
      // No previous deployment, or git couldn't tell.
      [],
      null,
    ]) {
      expect(shouldSkip({ ...production, changedFiles }).skip).toBe(false);
    }
  });

  it("skips anything with [skip ci], production included", () => {
    expect(
      shouldSkip({
        message: "docs [skip ci]",
        env: "production",
        branch: "main",
      }).skip,
    ).toBe(true);
  });
});

// Vercel's rule for git.deploymentEnabled: branch keys are minimatch
// patterns, unlisted branches deploy, and a branch deploys when at least one
// matching rule is true. This config only uses three pattern shapes ("**",
// "<prefix>/**" and exact names); the first test fails if another shape is
// added, so this small matcher stays faithful to minimatch for our keys.
const vercelJson = JSON.parse(
  readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
) as { git?: { deploymentEnabled?: Record<string, boolean> } };
const rules = vercelJson.git?.deploymentEnabled ?? {};

function matches(pattern: string, branch: string): boolean {
  if (pattern === "**") return true;
  if (pattern.endsWith("/**")) return branch.startsWith(pattern.slice(0, -2));
  return pattern === branch;
}

function deploys(branch: string): boolean {
  const hits = Object.entries(rules).filter(([pattern]) =>
    matches(pattern, branch),
  );
  return hits.length === 0 || hits.some(([, enabled]) => enabled);
}

describe("vercel.json git.deploymentEnabled", () => {
  it("only uses pattern shapes this test understands", () => {
    for (const pattern of Object.keys(rules)) {
      expect(
        pattern === "**" ||
          /^[\w.-]+\/\*\*$/.test(pattern) ||
          /^[\w./-]+$/.test(pattern),
      ).toBe(true);
    }
  });

  it("deploys main", () => {
    expect(deploys("main")).toBe(true);
  });

  it("creates no deployment for any other branch", () => {
    for (const branch of [
      "staging",
      "preview/x",
      "preview/a/b",
      "feat/x",
      "fix/y",
      "docs/z",
      "dependabot/npm_and_yarn/next-16",
      "release",
      "mainline",
      "staging-old",
    ]) {
      expect(deploys(branch), branch).toBe(false);
    }
  });
});
