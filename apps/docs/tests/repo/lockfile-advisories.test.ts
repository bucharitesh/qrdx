// The Dependabot alerts on pnpm-lock.yaml (2026-11-06): no package in the
// lockfile resolves inside a vulnerable range that has a fix its dependents
// can take. Fixed through the root package.json's pnpm.overrides, each scoped
// to the vulnerable range. The ones left open say why: their only fix is a
// major (or 0.x minor) that every dependent, at its latest version, rules out.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Version = [number, number, number];

const parse = (version: string): Version => {
  const [major = 0, minor = 0, patch = 0] = version
    .split("-")[0]
    ?.split(".")
    .map(Number) ?? [0, 0, 0];
  return [major, minor, patch];
};

const compare = (a: Version, b: Version) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

interface Advisory {
  ghsa: string;
  pkg: string;
  /** Vulnerable from (inclusive; none = from 0) */
  from?: string;
  /** Vulnerable below (exclusive) */
  below: string;
}

const FIXED: Advisory[] = [
  {
    ghsa: "GHSA-rj75-hqrm-r3gf",
    pkg: "postcss-selector-parser",
    below: "6.1.5",
  },
  {
    ghsa: "GHSA-rj75-hqrm-r3gf",
    pkg: "postcss-selector-parser",
    from: "7.0.0",
    below: "7.1.6",
  },
  {
    ghsa: "GHSA-w9m9-85wc-3x92",
    pkg: "postcss-selector-parser",
    from: "7.1.0",
    below: "7.1.3",
  },
  {
    ghsa: "GHSA-238p-pmpm-9mq7",
    pkg: "katex",
    from: "0.11.0",
    below: "0.18.2",
  },
  {
    ghsa: "GHSA-w5vr-8v7q-w6rv",
    pkg: "baseline-browser-mapping",
    from: "2.0.0",
    below: "2.11.0",
  },
  { ghsa: "GHSA-px8p-9vwx-vf98", pkg: "fflate", from: "0.4.5", below: "0.4.9" },
  // <= 7.29.0
  { ghsa: "GHSA-4x5r-pxfx-6jf8", pkg: "@babel/core", below: "7.29.1" },
  { ghsa: "GHSA-w5hq-g745-h8pq", pkg: "uuid", below: "11.1.1" },
];

/** Left open, with the reason (see the PR). */
const OPEN: (Advisory & { why: string })[] = [
  {
    ghsa: "GHSA-g3hv-75wg-m249",
    pkg: "minimatch",
    from: "7.0.0",
    below: "11.0.1",
    why: "fixed only in 11; eslint, glob 13, ts-morph, oclif and typescript-eslint (latest too) need ^10",
  },
  {
    ghsa: "GHSA-3g3m-2fjr-6pw4",
    pkg: "glob",
    from: "9.0.0",
    below: "14.0.2",
    why: "fixed only in 14; react-email (latest too) needs ^13",
  },
  {
    ghsa: "GHSA-gcqx-w48m-w2h4",
    pkg: "deepmerge",
    from: "4.2.0",
    below: "4.3.2",
    why: "no fixed version published",
  },
  {
    ghsa: "GHSA-67mh-4wv8-2f99",
    pkg: "esbuild",
    below: "0.25.0",
    why: "fixed in 0.25; drizzle-kit (latest too) loads it through @esbuild-kit/core-utils, which pins ~0.18.20; the bug is in esbuild's serve(), which that loader never calls",
  },
];

/** Every version of `pkg` the lockfile resolves. */
function lockedVersions(lock: string, pkg: string): string[] {
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const pattern = new RegExp(
    `^ {2}'?${escaped}@(\\d+\\.\\d+\\.\\d+[^:(']*)'?:`,
    "gm",
  );
  return [...new Set([...lock.matchAll(pattern)].map((m) => m[1] as string))];
}

const inRange = (version: string, advisory: Advisory) => {
  const v = parse(version);
  return (
    (!advisory.from || compare(v, parse(advisory.from)) >= 0) &&
    compare(v, parse(advisory.below)) < 0
  );
};

const lock = readFileSync(join(process.cwd(), "../../pnpm-lock.yaml"), "utf8");

describe("pnpm-lock.yaml against the Dependabot alerts", () => {
  it("resolves nothing inside a range with a fix the dependents can take", () => {
    const vulnerable = FIXED.flatMap((advisory) =>
      lockedVersions(lock, advisory.pkg)
        .filter((version) => inRange(version, advisory))
        .map((version) => `${advisory.pkg}@${version} (${advisory.ghsa})`),
    );
    expect(vulnerable).toEqual([]);
  });

  it("finds each package it checks in the lockfile", () => {
    for (const { pkg } of [...FIXED, ...OPEN]) {
      expect(lockedVersions(lock, pkg).length, pkg).toBeGreaterThan(0);
    }
  });
});
