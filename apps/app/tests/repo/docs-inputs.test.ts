// The docs site (apps/docs) builds from a few of this app's files: the
// product facts snapshot and what it imports, the message catalogs and the
// OpenAPI document (apps/docs/scripts/zone-inputs.mjs). turbo.json lists them
// as inputs of the docs' typecheck and tests, and the deploy workflow as
// paths that redeploy the docs; both must follow the snapshot's imports.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP = path.resolve(import.meta.dirname, "../..");
const REPO = path.resolve(APP, "../..");

/** This app's files `entry` imports, itself included (repo paths). */
function importsOf(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [path.join(APP, entry)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(
      /(?:from|import)\s*\(?\s*["']([^"']+)["']/g,
    )) {
      const spec = specifier as string;
      const base = spec.startsWith("@/")
        ? path.join(APP, spec.slice(2))
        : spec.startsWith(".")
          ? path.resolve(path.dirname(file), spec)
          : null;
      const found = base
        ? ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
            .map((suffix) => `${base}${suffix}`)
            .find(
              (candidate) =>
                /\.tsx?$/.test(candidate) &&
                existsSync(candidate) &&
                statSync(candidate).isFile(),
            )
        : undefined;
      if (found?.startsWith(APP)) queue.push(found);
    }
  }
  return [...seen].map((file) => path.relative(REPO, file)).sort();
}

const facts = importsOf("scripts/facts-snapshot.ts");

describe("the docs site's inputs from this app", () => {
  it("include the product facts snapshot's imports", () => {
    expect(facts).toContain("apps/app/lib/product-facts.ts");
    expect(facts.length).toBeGreaterThan(5);
  });

  it("are the docs tasks' inputs in turbo.json", () => {
    const turbo = JSON.parse(
      readFileSync(path.join(REPO, "turbo.json"), "utf8"),
    ) as { tasks: Record<string, { inputs?: string[] }> };
    for (const task of ["docs#typecheck", "docs#test"]) {
      const inputs = turbo.tasks[task]?.inputs ?? [];
      for (const file of facts) {
        expect(inputs, `${task}: ${file}`).toContain(`$TURBO_ROOT$/${file}`);
      }
    }
  });

  it("redeploy the docs (.github/workflows/docs-deploy.yml)", () => {
    const workflow = readFileSync(
      path.join(REPO, ".github/workflows/docs-deploy.yml"),
      "utf8",
    );
    const paths = [...workflow.matchAll(/^\s+- (\S+)$/gm)].map(
      (match) => match[1],
    );
    for (const file of facts) {
      expect(paths, file).toContain(file);
    }
  });
});
