// The disabled docs-feedback server action (which posted unauthenticated,
// unvalidated text to GitHub Discussions) is gone: nothing in the app can
// write to GitHub on a visitor's behalf.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as github from "@/lib/github";

const root = join(import.meta.dirname, "../..");

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

describe("docs feedback", () => {
  it("lib/github only builds links", () => {
    expect(Object.keys(github).sort()).toEqual([
      "getGitHubIssueUrl",
      "getGithubFileUrl",
      "owner",
      "repo",
    ]);
    const source = readFileSync(join(root, "lib/github.tsx"), "utf8");
    expect(source).not.toMatch(/use server/);
    expect(source).not.toMatch(/octokit/i);
  });

  it("no app code creates GitHub discussions or comments", () => {
    for (const dir of ["app", "actions", "components", "lib"]) {
      for (const file of sources(join(root, dir))) {
        const text = readFileSync(file, "utf8");
        expect(text, file).not.toMatch(
          /createDiscussion|addDiscussionComment|from "octokit"/,
        );
      }
    }
  });
});
