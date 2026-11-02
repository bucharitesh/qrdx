import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Tests run inside `turbo build` on Vercel with the deployment's env loaded
// (preview or production). vitest.config.ts and scripts/run-node-tests.mjs
// strip those variables first; a variable missing from that list leaked into
// tests once (an AI art switch, since removed, turned AI art off in its own tests).
const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function deploymentEnv(path: string): RegExp {
  const match = read(path).match(/const DEPLOYMENT_ENV =\s*\/(.+)\/;/);
  if (!match?.[1]) throw new Error(`DEPLOYMENT_ENV not found in ${path}`);
  return new RegExp(match[1]);
}

const vitestList = deploymentEnv("vitest.config.ts");
const nodeList = deploymentEnv("scripts/run-node-tests.mjs");
const appVars = [
  ...read("lib/env.ts").matchAll(/^\s{4}([A-Z][A-Z0-9_]+):\s*z\./gm),
].map((m) => m[1] as string);

describe("hermetic test env", () => {
  it("strips the same variables in vitest and the node test runner", () => {
    expect(nodeList.source).toBe(vitestList.source);
  });

  it.each([...new Set(appVars)])("strips %s from lib/env.ts", (name) => {
    expect(vitestList.test(name)).toBe(true);
  });
});
