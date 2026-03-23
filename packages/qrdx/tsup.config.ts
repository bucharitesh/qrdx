import { defineConfig } from "tsup";

export default defineConfig([
  // ── Library ───────────────────────────────────────────────────────────────
  {
    entry: ["src/index.tsx"],
    outDir: "dist",
    sourcemap: true,
    clean: true,
    dts: false, // Disable DTS generation via tsup due to namespace issues in codegen
    format: ["cjs", "esm"],
    external: ["react", "react-dom", "jsqr"],
    treeshake: true,
    splitting: false,
    minify: true,
    esbuildOptions(options) {
      options.banner = { js: '"use client";' };
      options.jsx = "automatic";
      options.jsxImportSource = "react";
    },
  },
  // ── CLI binary ────────────────────────────────────────────────────────────
  {
    entry: { cli: "../cli/src/index.ts" },
    outDir: "dist",
    format: ["cjs"],
    outExtension: () => ({ js: ".js" }),
    banner: { js: "#!/usr/bin/env node" },
    external: ["sharp"],
    clean: false,
    sourcemap: false,
    splitting: false,
    treeshake: true,
    minify: false,
    esbuildOptions(options) {
      options.jsx = "automatic";
      options.jsxImportSource = "react";
      // Resolve 'qrdx' imports inside the CLI to the local src to avoid circular refs
      options.alias = { qrdx: "./src/index.tsx" };
    },
  },
]);
