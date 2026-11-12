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
  // ── qrdx/types (schemas + helpers, no React) ────────────────────────────
  {
    ...shared,
    entry: { "types/index": "types/index.ts" },
    format: ["cjs", "esm"],
    treeshake: true,
  },
]);
