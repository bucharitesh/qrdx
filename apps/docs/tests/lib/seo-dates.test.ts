// Sitemap lastmod dates (lib/seo-dates.ts): real dates or none. The git part
// runs against a throwaway repository and a shallow clone of it, the way
// Vercel checks code out, so the shallow-boundary rule is tested on real git
// output. Nothing here touches this repository.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { industries, placements } from "@/lib/seo-content";
import {
  gitLastModified,
  latestDate,
  parseGitLog,
  shallowBoundary,
  trustedGitDate,
} from "@/lib/seo-dates";
import {
  PAGE_SOURCES,
  QR_TYPES_SOURCE,
  seoGroupSource,
} from "@/lib/seo-page-sources";

describe("parseGitLog", () => {
  it("keeps the newest date per file", () => {
    const log = [
      "commit:2026-11-02T10:00:00+05:30",
      "",
      "a.ts",
      "",
      "commit:2026-10-31T09:00:00Z",
      "",
      "a.ts",
      "b.ts",
      "",
    ].join("\n");
    const dates = parseGitLog(log);
    expect(dates.get("a.ts")?.toISOString()).toBe("2026-11-02T04:30:00.000Z");
    expect(dates.get("b.ts")?.toISOString()).toBe("2026-10-31T09:00:00.000Z");
  });

  it("skips files under a commit with an unreadable date", () => {
    expect(parseGitLog("commit:not-a-date\nc.ts\n").size).toBe(0);
  });
});

describe("trustedGitDate", () => {
  const boundary = new Set([Date.parse("2026-11-02T00:00:00Z")]);

  it("drops a shallow clone's boundary date", () => {
    expect(trustedGitDate("2026-11-02T00:00:00Z", boundary)).toBeUndefined();
  });

  it("keeps any other date", () => {
    expect(trustedGitDate("2026-11-01T12:00:00Z", boundary)).toEqual(
      new Date("2026-11-01T12:00:00Z"),
    );
    expect(trustedGitDate("2026-11-01T12:00:00Z", new Set())).toBeDefined();
  });

  it("trusts nothing without git, or without a date", () => {
    expect(trustedGitDate("2026-11-01T12:00:00Z", null)).toBeUndefined();
    expect(trustedGitDate(undefined, new Set())).toBeUndefined();
    expect(trustedGitDate("soon", new Set())).toBeUndefined();
  });
});

describe("latestDate", () => {
  it("returns the newest valid date", () => {
    expect(
      latestDate(["2026-03-22", undefined, "bad", new Date("2026-10-31")]),
    ).toEqual(new Date("2026-10-31"));
    expect(latestDate([undefined])).toBeUndefined();
  });
});

describe("sitemap source files", () => {
  it.each([
    QR_TYPES_SOURCE,
    ...Object.values(PAGE_SOURCES).flat(),
    ...[industries, placements].flatMap((collection) =>
      collection.groups.map((group) => seoGroupSource(collection, group.id)),
    ),
  ])("%s exists", (file) => {
    expect(existsSync(join(import.meta.dirname, "../..", file))).toBe(true);
  });
});

function hasGit(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.runIf(hasGit())("git dates from a full and a shallow checkout", () => {
  let root = "";
  let repo = "";
  let clone = "";
  // Fixed config so the user's own git settings (signing, hooks) don't apply.
  const config = [
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=/dev/null",
  ];
  const run = (cwd: string, args: string[], date?: string) =>
    execFileSync("git", [...config, ...args], {
      cwd,
      stdio: "ignore",
      env: {
        ...process.env,
        ...(date && { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
      },
    });
  const commit = (file: string, date: string) => {
    writeFileSync(join(repo, file), `${file} at ${date}\n`);
    run(repo, ["add", file]);
    run(repo, ["commit", "-q", "-m", `${file} ${date}`], date);
  };

  beforeAll(() => {
    // realpath: macOS temp dirs sit behind the /var -> /private/var symlink.
    root = realpathSync(mkdtempSync(join(tmpdir(), "seo-dates-")));
    repo = join(root, "repo");
    clone = join(root, "clone");
    mkdirSync(repo);
    run(repo, ["init", "-q"]);
    commit("old.ts", "2026-01-01T00:00:00Z");
    commit("mid.ts", "2026-02-01T00:00:00Z");
    commit("new.ts", "2026-03-01T00:00:00Z");
    commit("old.ts", "2026-04-01T00:00:00Z");
    commit("boundary.ts", "2026-05-01T00:00:00Z");
    commit("recent.ts", "2026-06-01T00:00:00Z");
    // The last two commits only, like Vercel's shallow clone.
    run(root, ["clone", "-q", "--depth", "2", `file://${repo}`, clone]);
  });

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("uses every file's own date from a complete history", () => {
    expect(shallowBoundary(repo)?.size).toBe(0);
    const dates = gitLastModified(["old.ts", "mid.ts", "recent.ts"], repo);
    expect(dates.get("old.ts")?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(dates.get("mid.ts")?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(dates.get("recent.ts")?.toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  it("drops dates a shallow clone can't know instead of using the boundary", () => {
    expect(shallowBoundary(clone)).toEqual(
      new Set([Date.parse("2026-05-01T00:00:00Z")]),
    );
    const dates = gitLastModified(
      ["old.ts", "mid.ts", "boundary.ts", "recent.ts"],
      clone,
    );
    // Changed after the boundary: a real date.
    expect(dates.get("recent.ts")?.toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
    // The boundary commit's own file and every older one all show the
    // boundary's date, so none can be told apart: left out.
    expect(dates.has("boundary.ts")).toBe(false);
    expect(dates.has("old.ts")).toBe(false);
    expect(dates.has("mid.ts")).toBe(false);
  });

  it("trusts no git date outside a repository", () => {
    expect(shallowBoundary(root)).toBeNull();
    expect(gitLastModified(["repo/old.ts"], root).size).toBe(0);
  });
});
