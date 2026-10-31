import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "tsup";

// IIFE output bundles every dependency: Figma loads single files.
const shared = {
  outDir: "dist",
  format: ["iife"],
  outExtension: () => ({ js: ".js" }),
  platform: "browser",
  minify: true,
} as const;

// Figma's UI must be one HTML file, so the UI bundle and styles are inlined into dist/ui.html.
async function writeUiHtml() {
  const [script, css] = await Promise.all([
    readFile("dist/ui.js", "utf8"),
    readFile("src/ui.css", "utf8"),
  ]);
  await writeFile(
    "dist/ui.html",
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>QRdx</title><style>${css.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`
  );
}

export default defineConfig([
  // Main thread (Figma sandbox, no DOM). Figma recommends an ES6 target.
  { ...shared, entry: { code: "src/code.ts" }, target: "es6" },
  // UI iframe.
  {
    ...shared,
    entry: { ui: "src/ui.tsx" },
    target: "es2020",
    env: { NODE_ENV: "production" },
    esbuildOptions(options) {
      // qrdx loads these on demand for PDF export and scanning, which the
      // plugin never uses; leave them out of the bundle.
      options.external = ["jspdf", "jsqr"];
    },
    onSuccess: writeUiHtml,
  },
]);
