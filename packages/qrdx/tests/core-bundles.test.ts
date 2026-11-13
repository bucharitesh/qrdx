// The React-free entries, as built: qrdx/core, qrdx/vanilla (and its
// no-bundler file) and qrdx/node never import react or react-dom, and
// vanilla and node take the engine from dist/core rather than a copy of
// their own. The engine is built before the tests in CI and before pushing;
// without a dist these checks have nothing to say.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dist = (file: string) => new URL(`../dist/${file}`, import.meta.url);
const read = (file: string) => readFileSync(dist(file), "utf8");

/** Every module a built file imports, statically or on demand. */
function imports(code: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s*["']([^"']+)["']/gm,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      found.add(match[1] as string);
    }
  }
  return [...found].sort();
}

const REACT_FREE = [
  "core.mjs",
  "core.js",
  "vanilla.mjs",
  "vanilla.js",
  "vanilla.browser.mjs",
  "node.mjs",
  "node.js",
  "angular.mjs",
  "angular.js",
];

describe("React-free bundles", () => {
  it.each(REACT_FREE)("%s never imports react or react-dom", (file) => {
    if (!existsSync(dist(file))) return;
    const code = read(file);
    for (const specifier of imports(code)) {
      expect(specifier).not.toMatch(/^react(-dom)?(\/|$)/);
    }
    expect(code).not.toMatch(/react-dom/);
    expect(code).not.toMatch(/renderToStaticMarkup/);
  });

  it.each([
    ["vanilla.mjs", ["./core.mjs"]],
    ["vanilla.js", ["./core.js"]],
    ["node.mjs", ["./core.mjs", "@resvg/resvg-js", "sharp"]],
    ["node.js", ["./core.js", "@resvg/resvg-js", "sharp"]],
    ["angular.mjs", ["./core.mjs", "@angular/core"]],
    ["angular.js", ["./core.js", "@angular/core"]],
  ])("%s takes the engine from dist/core", (file, allowed) => {
    if (!existsSync(dist(file))) return;
    expect(imports(read(file))).toEqual([...allowed].sort());
  });

  it("the no-bundler file stands alone", () => {
    if (!existsSync(dist("vanilla.browser.mjs"))) return;
    const code = read("vanilla.browser.mjs");
    // Only the optional, on-demand imports a page maps itself
    expect(imports(code)).toEqual(["jspdf", "jsqr"]);
    expect(code).not.toMatch(/\bfrom\s*["']/);
    // The official frame library's data stays out (it ships next to it)
    expect(code).not.toMatch(/allergen-info/);
    expect(code).toMatch(/\bcreateQRCode\b/);
  });
});
