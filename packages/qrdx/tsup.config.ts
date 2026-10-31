import type { Plugin } from "esbuild";
import { defineConfig, type Options } from "tsup";

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
  external: ["react", "react-dom", "jsqr", "jspdf"],
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

// The configs below build in parallel, so dist/ is cleaned by the "build"
// script rather than with tsup's `clean` (which would race the other entries).
export default defineConfig([
  // ── Library (server-safe) ───────────────────────────────────────────────
  {
    ...shared,
    entry: ["src/index.tsx"],
    format: ["esm"],
    treeshake: true,
    esbuildPlugins: [clientEntryExternal(".mjs")],
  },
  {
    ...shared,
    entry: ["src/index.tsx"],
    format: ["cjs"],
    treeshake: true,
    esbuildPlugins: [clientEntryExternal(".js")],
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
