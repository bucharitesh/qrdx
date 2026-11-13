import { dirname, relative, resolve } from "node:path";
import { defineConfig, type Options } from "tsup";

// esbuild's Plugin type, via tsup (esbuild is tsup's dependency, not ours).
type Plugin = NonNullable<Options["esbuildPlugins"]>[number];

// QRCodeCanvas needs client-only hooks, so it is built as its own entry that
// keeps its "use client" directive. The main entry imports that built file
// instead of inlining it, which keeps the rest of the package server-safe (RSC).
const clientEntryExternal = (extension: ".js" | ".mjs"): Plugin => ({
  name: "qrdx-client-entry-external",
  setup(build) {
    build.onResolve({ filter: /^\.\/qr-code-canvas$/ }, () => ({
      path: `./qr-code-canvas${extension}`,
      external: true,
    }));
  },
});

const shared: Options = {
  outDir: "dist",
  sourcemap: true,
  dts: false, // Declarations are emitted by tsc (see the "build" script)
  external: ["react", "react-dom", "jsqr", "jspdf", "@resvg/resvg-js", "sharp"],
  splitting: false,
  minify: true,
  esbuildOptions(options) {
    options.jsx = "automatic";
    options.jsxImportSource = "react";
    // src/ and types/ ship in the package, so maps can point at them instead
    // of embedding a second copy of every source file.
    options.sourcesContent = false;
  },
};

// The official frame library (hundreds of specs) and its index are built as
// modules of their own; the main entry re-exports them, so a bundler that
// skips unused side-effect-free modules never ships the data to an app that
// doesn't use it (the playground loads it on demand instead).
const FRAME_DATA: Record<string, string> = {
  "./frames/official": "frames-official",
  "./frames/catalogue/index": "frames-index",
};
const frameDataExternal = (extension: ".js" | ".mjs"): Plugin => ({
  name: "qrdx-frame-data-external",
  setup(build) {
    build.onResolve(
      { filter: /^\.\/frames\/(official|catalogue\/index)$/ },
      (args) => ({
        path: `./${FRAME_DATA[args.path]}${extension}`,
        external: true,
      })
    );
  },
});

// qrdx/core (dist/core) is the one React-free engine: qrdx/vanilla, qrdx/node
// and the framework adapters import it rather than bundling their own copy,
// so an app that uses two of them loads the engine once. Each of these
// entries may bundle only its own modules (`own`); any other import of the
// engine is an error, since it would be a second copy of the engine.
const sharedCore = (extension: ".js" | ".mjs", own: string[]): Plugin => ({
  name: "qrdx-shared-core",
  setup(build) {
    build.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (args.kind === "entry-point") {
        return;
      }
      if (/^\.\/(core|engine)$/.test(args.path)) {
        return { path: `./core${extension}`, external: true };
      }
      const target = relative(
        resolve("src"),
        resolve(dirname(args.importer), args.path)
      );
      if (own.includes(target)) {
        return;
      }
      return {
        errors: [
          {
            text: `${relative(".", args.importer)} imports ${args.path}; import the engine from "./core" instead`,
          },
        ],
      };
    });
  },
});

// zod's `locales` namespace (every language's error messages, about 260 KB
// minified) is left out of the no-bundler browser file: the schemas use the
// English messages, which zod imports on its own, and the file never exposes
// `z`, so nothing can reach the other languages.
const dropZodLocales: Plugin = {
  name: "qrdx-drop-zod-locales",
  setup(build) {
    build.onResolve({ filter: /\/locales\/index\.js$/ }, (args) =>
      /[\\/]zod[\\/]/.test(args.importer)
        ? { path: "zod-locales", namespace: "qrdx-empty" }
        : undefined
    );
    build.onLoad({ filter: /.*/, namespace: "qrdx-empty" }, () => ({
      contents: "export {};",
      loader: "js",
    }));
  },
};

// qrdx/element/define registers <qrdx-code> and re-exports qrdx/element: it
// imports the built element file rather than a copy of the class.
const elementExternal = (file: string): Plugin => ({
  name: "qrdx-element-external",
  setup(build) {
    build.onResolve({ filter: /^\.\/element$/ }, () => ({
      path: `./${file}`,
      external: true,
    }));
  },
});

// The no-bundler <qrdx-code> file takes the engine from src/engine.ts, the
// core without the official frame library's data (as vanilla.browser does).
const coreWithoutFrameData: Plugin = {
  name: "qrdx-core-without-frame-data",
  setup(build) {
    build.onResolve({ filter: /^\.\/core$/ }, () => ({
      path: resolve("src/engine.ts"),
    }));
  },
};

// The configs below build in parallel, so dist/ is cleaned by the "build"
// script rather than with tsup's `clean` (which would race the other entries).
export default defineConfig([
  // ── Library (server-safe) ───────────────────────────────────────────────
  {
    ...shared,
    entry: ["src/index.tsx"],
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [clientEntryExternal(".mjs"), frameDataExternal(".mjs")],
  },
  {
    ...shared,
    entry: ["src/index.tsx"],
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [clientEntryExternal(".js"), frameDataExternal(".js")],
  },
  // ── Official frame data (re-exported by the main entry) ────────────────
  {
    ...shared,
    entry: {
      "frames-official": "src/frames/official.ts",
      "frames-index": "src/frames/catalogue/index.ts",
    },
    format: ["cjs", "esm"],
    treeshake: true,
  },
  // ── Client component entry ──────────────────────────────────────────────
  {
    ...shared,
    entry: ["src/qr-code-canvas.tsx"],
    format: ["cjs", "esm"],
    // esbuild keeps the entry's "use client" directive, but tsup's rollup
    // tree-shaking pass would strip it, so rely on esbuild's tree-shaking here.
    treeshake: false,
  },
  // ── React-free engine (qrdx/core) ───────────────────────────────────────
  {
    ...shared,
    entry: { core: "src/core.ts" },
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [frameDataExternal(".mjs")],
  },
  {
    ...shared,
    entry: { core: "src/core.ts" },
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [frameDataExternal(".js")],
  },
  // ── Plain JavaScript API (qrdx/vanilla), on the shared core ─────────────
  {
    ...shared,
    entry: { vanilla: "src/vanilla.ts" },
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".mjs", ["vanilla-api"])],
  },
  {
    ...shared,
    entry: { vanilla: "src/vanilla.ts" },
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".js", ["vanilla-api"])],
  },
  // ── qrdx/vanilla as one file for <script type="module">, no bundler ─────
  // zod is inlined; jspdf and jsqr stay on-demand imports (an import map
  // provides them), and the official frame library's data is left out.
  {
    ...shared,
    entry: { "vanilla.browser": "src/vanilla-browser.ts" },
    format: ["esm"],
    platform: "browser",
    treeshake: true,
    noExternal: ["zod"],
    esbuildPlugins: [dropZodLocales],
  },
  // ── <qrdx-code> custom element (qrdx/element), on the shared core ───────
  {
    ...shared,
    entry: { element: "src/element.ts" },
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".mjs", [])],
  },
  {
    ...shared,
    entry: { element: "src/element.ts" },
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".js", [])],
  },
  {
    ...shared,
    entry: { "element-define": "src/element-define.ts" },
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [elementExternal("element.mjs"), sharedCore(".mjs", [])],
  },
  {
    ...shared,
    entry: { "element-define": "src/element-define.ts" },
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [elementExternal("element.js"), sharedCore(".js", [])],
  },
  // ── <qrdx-code> as one file for <script type="module">, no bundler ──────
  // Like vanilla.browser: zod inlined, jspdf and jsqr on demand, no official
  // frame data. element-define.browser registers the tag from it.
  {
    ...shared,
    entry: { "element.browser": "src/element.ts" },
    format: ["esm"],
    platform: "browser",
    treeshake: true,
    noExternal: ["zod"],
    esbuildPlugins: [coreWithoutFrameData, dropZodLocales],
  },
  {
    ...shared,
    entry: { "element-define.browser": "src/element-define.ts" },
    format: ["esm"],
    platform: "browser",
    treeshake: true,
    esbuildPlugins: [elementExternal("element.browser.mjs")],
  },
  // ── Node-only PNG entry (qrdx/node), on the shared core ─────────────────
  // The native rasterizers live here alone, so the main entry never
  // mentions them and browser bundlers never see an import() to follow.
  {
    ...shared,
    entry: { node: "src/node.ts" },
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".mjs", ["rasterize"])],
  },
  {
    ...shared,
    entry: { node: "src/node.ts" },
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [sharedCore(".js", ["rasterize"])],
  },
  // ── qrdx/types (schemas + helpers, no React) ────────────────────────────
  {
    ...shared,
    entry: { "types/index": "types/public.ts" },
    format: ["cjs", "esm"],
    treeshake: true,
  },
]);
