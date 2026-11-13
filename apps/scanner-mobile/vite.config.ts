import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The app is the web scanner (apps/docs/components/scanner) built on its
// own: the same components, strings and safety checks, with the few
// browser-only modules swapped for native ones below. It reads the web
// app's files in place, so run `bun install` at the repo root first.
const root = import.meta.dirname;
const docs = path.resolve(root, "../docs");
const designSystem = path.resolve(root, "../../packages/design-system");
const scanner = path.join(docs, "components/scanner");
const native = (file: string) => path.join(root, "src/native", file);

/** Web modules → native modules with the same exports. */
const NATIVE_MODULES = new Map([
  // The camera: the system scanner (Apple Vision, ML Kit) instead of getUserMedia.
  [path.join(scanner, "camera-view.tsx"), native("camera-view.tsx")],
  // Link checks go to qrdx.dev from the device, not to the page's own server.
  [path.join(scanner, "link-check.ts"), native("link-check.ts")],
  // Files (contacts, events, CSV) go to the share sheet instead of a download.
  [path.join(scanner, "download.ts"), native("download.ts")],
  // No "Install app" inside an app.
  [path.join(scanner, "install-app.tsx"), native("install-app.tsx")],
  // The empty-history illustration loads with next/dynamic; a still icon here.
  [path.join(docs, "components/mockups/hairline.tsx"), native("hairline.tsx")],
]);

function nativeModules(): Plugin {
  return {
    name: "qrdx-native-modules",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer?.startsWith(docs)) {
        return null;
      }
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      return (resolved && NATIVE_MODULES.get(resolved.id)) ?? null;
    },
  };
}

export default defineConfig({
  plugins: [nativeModules(), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${docs}/` },
      {
        find: /^@repo\/design-system$/,
        replacement: `${designSystem}/index.tsx`,
      },
      { find: /^@repo\/design-system\//, replacement: `${designSystem}/` },
      // The decoder the web components load, so the app configures that copy.
      {
        find: /^barcode-detector\/ponyfill$/,
        replacement: path.join(
          docs,
          "node_modules/barcode-detector/dist/es/ponyfill.js"
        ),
      },
      {
        find: /^next-intl$/,
        replacement: path.join(root, "src/shims/next-intl.ts"),
      },
      {
        find: /^next\/link$/,
        replacement: path.join(root, "src/shims/next-link.tsx"),
      },
    ],
    // One React for the app and the web components it reuses.
    dedupe: ["react", "react-dom", "use-intl"],
  },
  server: { fs: { allow: [path.resolve(root, "../..")] } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: ["es2022", "safari16", "chrome111"],
  },
});
