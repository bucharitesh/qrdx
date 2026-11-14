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
  });
});

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

// zod (hundreds of kilobytes) loads only where validation really runs: the
// schemas are dist/schemas, which the core and the React entry re-export by
// name and nothing they draw with imports. Drawing frame specs uses the
// engine's own parser (types/frame-spec-parse.ts).
describe("rendering without zod", () => {
  const ZOD_CODE = /\b_zod\b|\bZodError\b|\$ZodType/;
  const NO_ZOD = [
    "core.mjs",
    "core.js",
    "index.mjs",
    "index.js",
    "qr-code-canvas.mjs",
    "qr-code-canvas.js",
    "vanilla.mjs",
    "vanilla.js",
    "node.mjs",
    "node.js",
    "vue.mjs",
    "vue.js",
    "preact.mjs",
    "preact.js",
    "solid.mjs",
    "solid.js",
    "angular.mjs",
    "angular.js",
    "element.mjs",
    "element.js",
    "element-define.mjs",
    "element-define.js",
    // The no-bundler <qrdx-code> exports no schema, so it carries no zod
    "element.browser.mjs",
  ];

  it.each(NO_ZOD)("%s neither imports nor contains zod", (file) => {
    if (!existsSync(dist(file))) return;
    const code = read(file);
    expect(imports(code).filter((name) => /^zod(\/|$)/.test(name))).toEqual([]);
    expect(code).not.toMatch(ZOD_CODE);
  });

  it("only dist/schemas imports zod", () => {
    if (!existsSync(dist("schemas.mjs"))) return;
    expect(imports(read("schemas.mjs"))).toEqual(["zod"]);
    expect(imports(read("schemas.js"))).toEqual(["zod"]);
  });

  it.each([
    ["core.mjs", /export\{([^}]*)\}from'\.\/schemas\.mjs'/g],
    ["index.mjs", /export\{([^}]*)\}from'\.\/schemas\.mjs'/g],
  ])(
    "%s re-exports every schema by name, and nothing else of it",
    async (file, pattern) => {
      if (!existsSync(dist(file))) return;
      const code = read(file);
      // No namespace import, which would keep every schema (and zod) alive
      expect(code).not.toMatch(/import\s*\*\s*as\s*\w+\s*from\s*'\.\/schemas/);
      const named = [...code.matchAll(pattern)].flatMap((match) =>
        (match[1] as string).split(",").map((name) => name.trim())
      );
      const schemas = await import("../types/schemas");
      expect(named.sort()).toEqual(Object.keys(schemas).sort());
    }
  );

  it("the source exports every schema from the engine", async () => {
    const schemas = await import("../types/schemas");
    const core = await import("../src/core");
    for (const name of Object.keys(schemas)) {
      expect(core, name).toHaveProperty(name);
      expect((core as Record<string, unknown>)[name], name).toBe(
        (schemas as Record<string, unknown>)[name]
      );
    }
  });

  // A bundler drops dist/schemas, and with it zod, from an app that only
  // draws codes. esbuild comes with tsup, which builds the package.
  it("an app that draws a code bundles no zod", async () => {
    if (!existsSync(dist("core.mjs"))) return;
    const { createRequire } = await import("node:module");
    const { fileURLToPath } = await import("node:url");
    let esbuild: typeof import("esbuild");
    try {
      const fromTsup = createRequire(
        createRequire(import.meta.url).resolve("tsup/package.json")
      );
      esbuild = await import(fromTsup.resolve("esbuild"));
    } catch {
      return;
    }
    const bundle = async (contents: string) => {
      const result = await esbuild.build({
        stdin: {
          contents,
          resolveDir: fileURLToPath(new URL("../dist/", import.meta.url)),
        },
        bundle: true,
        write: false,
        minify: true,
        format: "esm",
        platform: "browser",
        external: ["jsqr", "jspdf"],
        logLevel: "silent",
      });
      return result.outputFiles[0]?.text ?? "";
    };
    const draws = await bundle(
      'import { toSVGString, createQRCodeTree } from "./core.mjs"; console.log(toSVGString, createQRCodeTree);'
    );
    expect(draws).not.toMatch(ZOD_CODE);
    expect(draws).toMatch(/Invalid frame spec/);
    // …and keeps zod for an app that validates
    const validates = await bundle(
      'import { qrPropsSchema } from "./core.mjs"; console.log(qrPropsSchema);'
    );
    expect(validates).toMatch(ZOD_CODE);
  });
});
