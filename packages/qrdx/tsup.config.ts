import { defineConfig } from "tsup";

export default defineConfig({
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
    options.banner = {
      js: '"use client";',
    };
    options.jsx = "automatic";
    options.jsxImportSource = "react";
  },
});
