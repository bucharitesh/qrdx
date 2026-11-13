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
  "vue.mjs",
  "vue.js",
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
    ["vue.mjs", ["./core.mjs", "vue"]],
    ["vue.js", ["./core.js", "vue"]],
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

// <qrdx-code> (qrdx/element): the element takes the engine from dist/core,
// the auto-define entry takes the element from its built file, and the
// no-bundler pair stands alone.
describe("<qrdx-code> bundles", () => {
  const ELEMENT_FILES = [
    "element.mjs",
    "element.js",
    "element-define.mjs",
    "element-define.js",
    "element.browser.mjs",
    "element-define.browser.mjs",
  ];

  it.each(ELEMENT_FILES)("%s never imports react or react-dom", (file) => {
    if (!existsSync(dist(file))) return;
    const code = read(file);
    for (const specifier of imports(code)) {
      expect(specifier).not.toMatch(/^react(-dom)?(\/|$)/);
    }
    expect(code).not.toMatch(/react-dom/);
  });

  it.each([
    ["element.mjs", ["./core.mjs"]],
    ["element.js", ["./core.js"]],
    ["element-define.mjs", ["./element.mjs"]],
    ["element-define.js", ["./element.js"]],
    ["element-define.browser.mjs", ["./element.browser.mjs"]],
  ])("%s imports only %j", (file, allowed) => {
    if (!existsSync(dist(file))) return;
    expect(imports(read(file))).toEqual([...allowed].sort());
  });

  it("only the auto-define files register the element", () => {
    for (const file of ["element.mjs", "element.js", "element.browser.mjs"]) {
      if (!existsSync(dist(file))) continue;
      // customElements.define runs inside defineQRdxCode only
      expect(read(file)).not.toMatch(/defineQRdxCode\(\)/);
    }
  });

  it("the no-bundler element file stands alone", () => {
    if (!existsSync(dist("element.browser.mjs"))) return;
    const code = read("element.browser.mjs");
    // Only PDF export's on-demand jspdf, which a page maps itself
    expect(imports(code)).toEqual(["jspdf"]);
    expect(code).not.toMatch(/\bfrom\s*["']/);
    expect(code).not.toMatch(/allergen-info/);
    expect(code).toMatch(/\bdefineQRdxCode\b/);

// qrdx/preact and qrdx/solid: the engine from dist/core, the framework from
// the app, and nothing else (no React, no copy of the engine)
describe("Preact and Solid adapters", () => {
  it.each([
    ["preact.mjs", ["./core.mjs", "preact"]],
    ["preact.js", ["./core.js", "preact"]],
    ["solid.mjs", ["./core.mjs", "solid-js", "solid-js/web"]],
    ["solid.js", ["./core.js", "solid-js", "solid-js/web"]],
  ])("%s imports only dist/core and its framework", (file, allowed) => {
    if (!existsSync(dist(file))) return;
    const code = read(file);
    expect(imports(code)).toEqual([...allowed].sort());
    expect(code).not.toMatch(/react-dom|renderToStaticMarkup/);
    // A thin layer: the engine itself stays in dist/core
    expect(code.length).toBeLessThan(2000);
  });
});
