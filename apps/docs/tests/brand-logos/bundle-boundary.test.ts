// The full brand catalogue never reaches a page that doesn't open the logo
// gallery: simple-icons (every mark, several MB) is imported only by the
// server module, and the gallery's client chunk is reached only through a
// dynamic import, so Next splits it out and loads it on first open.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const SKIP = new Set([
  "node_modules",
  ".next",
  ".source",
  "tests",
  "e2e",
  "public",
  "scripts",
]);

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) sources(path, out);
    } else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

const files = sources(root).map((path) => ({
  path: relative(root, path),
  text: readFileSync(path, "utf8"),
}));

describe("brand logo bundles", () => {
  it("import simple-icons only on the server", () => {
    const importers = files
      .filter(({ text }) =>
        /from\s+["']simple-icons(?:\/[^"']*)?["']|import\(\s*["']simple-icons/.test(
          text,
        ),
      )
      .map(({ path }) => path);
    expect(importers).toEqual(["lib/brand-logos/server.ts"]);
    const server = files.find(
      ({ path }) => path === "lib/brand-logos/server.ts",
    );
    expect(server?.text.startsWith('import "server-only";')).toBe(true);
  });

  it("reach the gallery only through a dynamic import", () => {
    const gallery = /["'][^"']*brand-logos\/brand-logo-gallery["']/g;
    for (const { path, text } of files) {
      for (const match of text.matchAll(gallery)) {
        const before = text.slice(
          Math.max(0, (match.index ?? 0) - 120),
          match.index,
        );
        const dynamicImport = /import\(\s*$/.test(before);
        const typeOnly = /import\s+type\s+\{[^}]*\}\s+from\s+$/.test(before);
        expect(
          dynamicImport || typeOnly,
          `${path} imports the gallery statically`,
        ).toBe(true);
      }
    }
    const controls = files.find(({ path }) =>
      path.endsWith("control-sections/logo-controls.tsx"),
    );
    expect(controls?.text).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\("@\/components\/editor\/brand-logos\/brand-logo-gallery"\)/,
    );
  });

  it("fetch the catalogue only from the gallery", () => {
    const fetchers = files
      .filter(
        ({ path, text }) =>
          !path.startsWith("app/api/") && /["'`]\/api\/brand-logos/.test(text),
      )
      .map(({ path }) => path);
    expect(fetchers).toEqual([
      "components/editor/brand-logos/brand-logo-gallery.tsx",
    ]);
  });
});
