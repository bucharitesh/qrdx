// The docs site loads only DOCS_NAMESPACES of the main app's catalogs (the
// copy @repo/i18n/docs-messages loads). Every namespace this app's code
// reads must be one of them, or its strings would be missing here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { DOCS_NAMESPACES } from "@repo/i18n/messages";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");

/** The top-level namespaces this app's code reads, and where. */
function namespacesRead(): Map<string, string[]> {
  const files: string[] = [];
  const walk = (file: string) => {
    if (statSync(file).isDirectory()) {
      for (const name of readdirSync(file)) {
        if (name !== "node_modules") walk(path.join(file, name));
      }
    } else if (/\.tsx?$/.test(file)) files.push(file);
  };
  for (const entry of ["app", "components", "lib", "mdx-components.tsx"]) {
    walk(path.join(ROOT, entry));
  }

  const namespaces = new Map<string, string[]>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /(?:useTranslations|getTranslations)\(\s*(?:["']([^"']+)["']|\{[^}]*namespace:\s*["']([^"']+)["'])/g,
    )) {
      const namespace = (match[1] ?? match[2] ?? "").split(".")[0] as string;
      const list = namespaces.get(namespace) ?? [];
      list.push(path.relative(ROOT, file));
      namespaces.set(namespace, list);
    }
  }
  return namespaces;
}

describe("the docs' messages", () => {
  it("cover every namespace the docs read", () => {
    const read = namespacesRead();
    expect(read.size).toBeGreaterThan(0);
    for (const [namespace, readers] of read) {
      expect(
        DOCS_NAMESPACES,
        `${readers.join(", ")} read "${namespace}": add it to DOCS_NAMESPACES (packages/i18n/messages.ts)`,
      ).toContain(namespace);
    }
  });
});
