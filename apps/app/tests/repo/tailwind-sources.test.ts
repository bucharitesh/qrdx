// Tailwind scans each app's own folder, not the workspace packages it
// imports. A package that renders UI with Tailwind classes has to be listed
// with @source in the app's stylesheet, or its classes are silently left out
// of the build. That's how the cookie banner from @repo/analytics lost its
// desktop layout in November 2026. This test fails when a package with
// class names isn't covered.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it as test } from "vitest";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");

// A class list written as a string: className="…" or cn("…").
const CLASS_LITERAL = /className="[^"]|cn\(\s*"/;

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  "tests",
  "__tests__",
]);

// Packages an app depends on but whose class names it never renders.
const NOT_RENDERED: Record<string, Record<string, string>> = {
  "apps/app": {
    "@repo/docs-assets":
      "the app imports its data only (openapi.json, pattern-catalog, qr-catalog-tiles); the registry examples render in the docs app",
  },
  "apps/docs": {
    "@repo/integrations": "the docs import its catalog data only",
  },
};

// The folder an @source line covers: the path up to its first glob segment.
function sourceBase(cssFile: string, source: string): string {
  const fixed: string[] = [];
  for (const segment of source.split("/")) {
    if (/[*{]/.test(segment)) {
      break;
    }
    fixed.push(segment);
  }
  return resolve(dirname(cssFile), fixed.join("/"));
}

function sourcesOf(cssFile: string): string[] {
  const css = readFileSync(cssFile, "utf8");
  return [...css.matchAll(/@source\s+"([^"]+)"/g)].map((match) =>
    sourceBase(cssFile, match[1] ?? ""),
  );
}

function tsxFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...tsxFiles(join(dir, entry.name)));
      }
    } else if (entry.name.endsWith(".tsx")) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

const packageDirs = new Map<string, string>();
for (const name of readdirSync(join(REPO, "packages"))) {
  const dir = join(REPO, "packages", name);
  try {
    const manifest = JSON.parse(
      readFileSync(join(dir, "package.json"), "utf8"),
    ) as { name: string };
    packageDirs.set(manifest.name, dir);
  } catch {
    // Not a package (no package.json).
  }
}

describe.each(["apps/app", "apps/docs"])("%s Tailwind sources", (app) => {
  test("covers every workspace package whose class names it renders", () => {
    const appDir = join(REPO, app);
    const manifest = JSON.parse(
      readFileSync(join(appDir, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const workspaceDeps = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).filter((name) => name.startsWith("@repo/"));
    // The app's stylesheet imports the design system's globals.css, so the
    // @source lines in that file count too.
    const covered = [
      ...sourcesOf(join(appDir, "styles", "styles.css")),
      ...sourcesOf(
        join(REPO, "packages", "design-system", "styles", "globals.css"),
      ),
    ];

    const uncovered: string[] = [];
    for (const name of workspaceDeps) {
      const dir = packageDirs.get(name);
      if (!dir || NOT_RENDERED[app]?.[name]) {
        continue;
      }
      for (const file of tsxFiles(dir)) {
        if (!CLASS_LITERAL.test(readFileSync(file, "utf8"))) {
          continue;
        }
        if (!covered.some((base) => file.startsWith(base + sep))) {
          uncovered.push(relative(REPO, file));
        }
      }
    }

    expect(uncovered).toEqual([]);
  });
});
