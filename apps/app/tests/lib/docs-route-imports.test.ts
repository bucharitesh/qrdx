// Route handlers (route.ts, sitemap.ts, Open Graph images, …) never import
// the compiled docs. `next build` compiles every module once per layer that
// imports it, so a route that reaches lib/source.ts (or .source/docs.ts,
// .source/server.ts) compiles every docs page in every language a second
// time, which is what ran the Vercel build out of memory. Routes read the
// docs from lib/docs-index.ts and other content from lib/content-source.ts.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = join(import.meta.dirname, "../..");
const COMPILED_DOCS = ["lib/source.ts", ".source/docs.ts", ".source/server.ts"];
const ROUTE_FILE =
  /^(route\.tsx?|sitemap\.ts|robots\.ts|manifest\.ts|(opengraph|twitter)-image\.tsx|(apple-)?icon\.tsx)$/;
const EXTENSIONS = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"];

function resolveImport(from: string, spec: string): string | undefined {
  let base: string;
  if (spec.startsWith("@/")) base = join(app, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return undefined;
  for (const extension of EXTENSIONS) {
    const file = base + extension;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return undefined;
}

/** Local modules a file imports at runtime (type-only imports are erased). */
function imports(file: string): string[] {
  const code = readFileSync(file, "utf8").replace(
    /^(?:import|export) type [^;]*;/gms,
    "",
  );
  const specs = [
    ...code.matchAll(
      /(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|^import\s*["']([^"']+)["']/gm,
    ),
  ].map((match) => match[1] ?? match[2] ?? match[3] ?? "");
  return specs
    .map((spec) => resolveImport(file, spec))
    .filter((found): found is string => found !== undefined);
}

/** The import chain from `entry` to a compiled-docs module, if any. */
function chainToCompiledDocs(entry: string): string[] | undefined {
  const parent = new Map<string, string | undefined>([[entry, undefined]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const rel = relative(app, file);
    if (COMPILED_DOCS.includes(rel)) {
      const chain: string[] = [];
      for (let f: string | undefined = file; f; f = parent.get(f)) {
        chain.unshift(relative(app, f));
      }
      return chain;
    }
    if (!/\.[jt]sx?$/.test(file)) continue;
    for (const next of imports(file)) {
      if (!parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return undefined;
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return ROUTE_FILE.test(entry.name) ? [path] : [];
  });
}

describe("route handlers and the compiled docs", () => {
  const routes = routeFiles(join(app, "app"));

  it("finds the routes that read the docs", () => {
    const names = routes.map((file) => relative(app, file));
    expect(names).toContain("app/llms.mdx/[[...slug]]/route.ts");
    expect(names).toContain("app/api/search/route.ts");
    expect(names).toContain("app/sitemap.ts");
  });

  it("never imports lib/source.ts", () => {
    const offenders = routes
      .map(chainToCompiledDocs)
      .filter((chain) => chain !== undefined)
      .map((chain) => chain.join(" -> "));
    expect(offenders).toEqual([]);
  });

  it("catches a route that does", () => {
    // The docs page itself imports lib/source.ts: the check sees it.
    const page = join(app, "app/[lang]/docs/[[...slug]]/page.tsx");
    expect(chainToCompiledDocs(page)?.at(-1)).toBe("lib/source.ts");
  });
});
