// app/ has two root layouts (app/[lang] for translated pages, app/(app) for
// the rest). A page added at app/<dir>, or an import of an old path, after a
// rebase shows up here: run `bun run --filter app i18n:split` to move it.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DOCS = path.join(import.meta.dirname, "../..");

describe("root layout split", () => {
  it("has nothing left to move or fix", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/i18n-split-roots.mjs", "--check"],
      { cwd: DOCS, encoding: "utf8" },
    );
    expect(output).toContain("Would make 0 move(s) and 0 reference fix(es).");
  });

  it("keeps only route handlers and metadata files at the top of app/", () => {
    const top = readdirSync(path.join(DOCS, "app"));
    expect(top).toEqual(expect.arrayContaining(["(app)", "[lang]"]));
    expect(top).not.toContain("layout.tsx");
    expect(top).not.toContain("dashboard");
    expect(top).not.toContain("(home)");
  });
});
