import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The docs ship to production as written, in every language: an unfilled
// "[[PLACEHOLDER]]" must never go live. The main app checks its own content
// the same way (apps/app/tests/lib/content-placeholders.test.ts).
const CONTENT = join(__dirname, "..", "..", "content");
const PLACEHOLDER = /\[\[[A-Z][^\]]*\]\]/;

function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return mdxFiles(path);
    return /\.mdx?$/.test(entry.name) ? [path] : [];
  });
}

describe("content placeholders", () => {
  it.each(
    mdxFiles(CONTENT).map((file) => [file.slice(CONTENT.length + 1), file]),
  )("%s has no unfilled [[PLACEHOLDER]]", (_name, file) => {
    const match = readFileSync(file, "utf8").match(PLACEHOLDER);
    expect(match?.[0] ?? null).toBeNull();
  });
});
