import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  outExtension: () => ({ js: ".js" }),
  banner: { js: "#!/usr/bin/env node" },
  external: ["sharp"],
  minify: false,
  clean: true,
  sourcemap: false,
  splitting: false,
  treeshake: true,
  esbuildOptions(options) {
    options.jsx = "automatic";
    options.jsxImportSource = "react";
  },
});
