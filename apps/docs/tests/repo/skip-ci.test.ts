// Vercel's ignored build step (scripts/skip-ci.js): only production and
// staging build; previews need [preview]; [skip ci] skips everything.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { shouldSkip } = require("../../scripts/skip-ci.js") as {
  shouldSkip: (input: { message: string; env?: string; branch?: string }) => {
    skip: boolean;
    reason: string;
  };
};

describe("skip-ci", () => {
  it("builds production and staging", () => {
    expect(
      shouldSkip({
        message: "Merge release",
        env: "production",
        branch: "main",
      }).skip,
    ).toBe(false);
    expect(
      shouldSkip({ message: "feat: x", env: "preview", branch: "staging" })
        .skip,
    ).toBe(false);
  });

  it("skips pull request previews unless asked", () => {
    expect(
      shouldSkip({ message: "feat: x", env: "preview", branch: "feat/x" }).skip,
    ).toBe(true);
    expect(
      shouldSkip({
        message: "feat: x [preview]",
        env: "preview",
        branch: "feat/x",
      }).skip,
    ).toBe(false);
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
