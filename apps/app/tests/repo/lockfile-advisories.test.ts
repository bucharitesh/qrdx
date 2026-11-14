// The Dependabot alerts on the lockfile (2026-11-06, 2026-11-10): no
// package in bun.lock resolves inside a vulnerable range that has a fix.
// Fixed by updating the dependency that pulls the package in where a newer
// release takes the fix, otherwise through the root package.json's
// overrides, scoped to the vulnerable range or to the parent. The ones
// left open say why.
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
  // react-email 6.11.9 and @oclif/core 5.1.12 take ^11; ts-morph, eslint,
  // @eslint/config-array and typescript-eslint through parent overrides.
  {
    ghsa: "GHSA-g3hv-75wg-m249",
    pkg: "minimatch",
    from: "7.0.0",
    below: "11.0.1",
  },
  // <= 14.0.1; react-email 6.11.9 takes ^14.0.3
  { ghsa: "GHSA-3g3m-2fjr-6pw4", pkg: "glob", from: "9.0.0", below: "14.0.2" },
  // <= 0.24.2; drizzle-kit's @esbuild-kit/core-utils, through an override
  { ghsa: "GHSA-67mh-4wv8-2f99", pkg: "esbuild", below: "0.25.0" },
];

/** Left open, with the reason (see the PR). */
const OPEN: (Advisory & { why: string })[] = [
  {
    ghsa: "GHSA-gcqx-w48m-w2h4",
    pkg: "deepmerge",
    from: "4.2.0",
    below: "4.3.2",
    why: "no fixed version published; only dev tools merge with it (@svgr/plugin-svgo, ultracite), on the repo's own config",
  },
];

/** Every version of `pkg` the lockfile resolves. */
function lockedVersions(lock: string, pkg: string): string[] {
  const escaped = pkg.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  // bun.lock "packages" entries: `"<path>": ["<name>@<version>", ...]`
  const pattern = new RegExp(
    `^ {4}"[^"]+": \\["${escaped}@(\\d+\\.\\d+\\.\\d+[^"]*)"`,
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

const lock = readFileSync(join(process.cwd(), "../../bun.lock"), "utf8");

describe("bun.lock against the Dependabot alerts", () => {
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
