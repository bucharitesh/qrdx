import { defineConfig } from "tsup";

// Load unpacked from dist/ (chrome://extensions → Developer mode → Load unpacked).
// IIFE output bundles every dependency: extensions can't load from node_modules.
export default defineConfig({
  entry: { popup: "src/popup.tsx", background: "src/background.ts" },
  outDir: "dist",
  format: ["iife"],
  outExtension: () => ({ js: ".js" }),
  platform: "browser",
  target: "chrome120",
  esbuildOptions(options) {
    // qrdx loads these on demand for PDF export and scanning, which the
    // extension never uses; leave them out of the bundle.
    options.external = ["jspdf", "jsqr"];
  },
  env: { NODE_ENV: "production" },
  minify: true,
  clean: true,
  publicDir: "public",
});
