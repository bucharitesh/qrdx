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
import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import { afterAll, beforeAll, describe, expect, it, test } from "vitest";
import { industries, placements } from "@/lib/seo-content";
import {
  gitFileDate,
  gitLastModified,
  latestDate,
  parseGitLog,
  shallowBoundary,
  sourceDate,
  trustedGitDate,
  withoutGitEnv,
} from "@/lib/seo-dates";
import recorded from "@/lib/seo-file-dates.json";
import {
  HOSTED_TYPES_SOURCE,
  INTEGRATION_SOURCES,
  integrationSource,
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

  it("keeps a moved file's dates from before the move", () => {
    const log = [
      "commit:2026-11-14T00:00:00Z",
      "",
      "R100\tapps/docs/a.mdx\tapps/app/a.mdx",
      "D\tapps/docs/b.mdx",
      "A\tapps/app/b.mdx",
      "",
      "commit:2026-11-01T00:00:00Z",
      "",
      "M\tapps/docs/a.mdx",
      "M\tapps/docs/b.mdx",
      "",
      "commit:2026-10-01T00:00:00Z",
      "",
      "R100\tdocs/a.mdx\tapps/docs/a.mdx",
      "",
      "commit:2026-09-01T00:00:00Z",
      "",
      "A\tdocs/a.mdx",
      "A\tdocs/c.mdx",
      "",
    ].join("\n");
    const dates = parseGitLog(log);
    // Moved unchanged twice: the edit before the moves.
    expect(dates.get("apps/app/a.mdx")?.toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    // Moved and edited in one commit (-M100% shows a delete and an add).
    expect(dates.get("apps/app/b.mdx")?.toISOString()).toBe(
      "2026-11-14T00:00:00.000Z",
    );
    // A deleted path keeps the date from before its delete; an exact
    // rename's dates go to the new path.
    expect(dates.get("apps/docs/b.mdx")?.toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(dates.has("apps/docs/a.mdx")).toBe(false);
    expect(dates.has("docs/a.mdx")).toBe(false);
    expect(dates.get("docs/c.mdx")?.toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
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

describe("sourceDate", () => {
  const dates = { "a.ts": "2026-10-01T00:00:00.000Z" };

  it("falls back to the recorded date when the build has no git date", () => {
    expect(sourceDate("a.ts", undefined, dates)).toEqual(
      new Date("2026-10-01T00:00:00.000Z"),
    );
  });

  it("takes the build's git date when it's newer", () => {
    const newer = new Date("2026-11-01T00:00:00.000Z");
    expect(sourceDate("a.ts", newer, dates)).toEqual(newer);
    expect(sourceDate("a.ts", new Date("2026-09-01"), dates)).toEqual(
      new Date("2026-10-01T00:00:00.000Z"),
    );
  });

  it("has no date for a file with neither", () => {
    expect(sourceDate("b.ts", undefined, dates)).toBeUndefined();
  });
});

describe("recorded file dates (lib/seo-file-dates.json)", () => {
  const entries = Object.entries(recorded as Record<string, string>);

  it("dates the sitemap's source files", () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(recorded).toHaveProperty([QR_TYPES_SOURCE]);
  });

  it.each(entries)("%s has a real past date", (_file, date) => {
    const time = Date.parse(date);
    expect(Number.isNaN(time)).toBe(false);
    expect(time).toBeLessThanOrEqual(Date.now());
  });
});

describe("integration page sources", () => {
  it("finds the catalog file for every integration", () => {
    for (const entry of getCatalogBySurface("integrations")) {
      expect(integrationSource(entry.slug), entry.slug).toBeDefined();
    }
    expect(integrationSource("no-such-integration")).toBeUndefined();
  });
});

describe("sitemap source files", () => {
  it.each([
    QR_TYPES_SOURCE,
    HOSTED_TYPES_SOURCE,
    ...Object.values(PAGE_SOURCES).flat(),
    ...INTEGRATION_SOURCES,
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
  let decoy = "";
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
  // Every GIT_* variable is dropped: inside a git hook (the pre-push hook
  // runs this suite) git sets GIT_DIR and friends, and passing them on made
  // `git init` and `git commit` here act on the real repository instead of
  // the temp one (it marked the checkout bare and committed these fixtures).
  const run = (cwd: string, args: string[], date?: string) =>
    execFileSync("git", [...config, ...args], {
      cwd,
      stdio: "ignore",
      env: {
        ...withoutGitEnv(process.env),
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
    decoy = join(root, "decoy");
    mkdirSync(repo);
    mkdirSync(decoy);
    run(decoy, ["init", "-q"]);
    // What a git hook does to every child process.
    const hookGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = join(decoy, ".git");
    try {
      buildFixtures();
    } finally {
      if (hookGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = hookGitDir;
    }
  });

  function buildFixtures() {
    run(repo, ["init", "-q"]);
    commit("old.ts", "2026-01-01T00:00:00Z");
    commit("mid.ts", "2026-02-01T00:00:00Z");
    commit("new.ts", "2026-03-01T00:00:00Z");
    commit("old.ts", "2026-04-01T00:00:00Z");
    commit("boundary.ts", "2026-05-01T00:00:00Z");
    commit("recent.ts", "2026-06-01T00:00:00Z");
    // The last two commits only, like Vercel's shallow clone.
    run(root, ["clone", "-q", "--depth", "2", `file://${repo}`, clone]);
  }

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  test("uses every file's own date from a complete history", () => {
    expect(shallowBoundary(repo)?.size).toBe(0);
    const dates = gitLastModified(["old.ts", "mid.ts", "recent.ts"], repo);
    expect(dates.get("old.ts")?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(dates.get("mid.ts")?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(dates.get("recent.ts")?.toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  test("drops dates a shallow clone can't know instead of using the boundary", () => {
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

  test("trusts no git date outside a repository", () => {
    expect(shallowBoundary(root)).toBeNull();
    expect(gitLastModified(["repo/old.ts"], root).size).toBe(0);
  });

  test("leaves the hook's repository alone when GIT_DIR points at it", () => {
    // beforeAll built the fixtures with GIT_DIR aimed at a decoy repo, as a
    // pre-push hook does: the decoy must have no commits and stay non-bare.
    const decoyGit = (args: string[]) =>
      execFileSync("git", args, {
        cwd: decoy,
        encoding: "utf8",
        env: withoutGitEnv(process.env),
      }).trim();
    expect(() => decoyGit(["rev-parse", "--verify", "HEAD"])).toThrow();
    expect(decoyGit(["config", "--get", "core.bare"])).toBe("false");
    expect(gitLastModified(["recent.ts"], repo).size).toBe(1);
  });
});

describe.runIf(hasGit())("git dates of moved files", () => {
  let repo = "";
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
  const run = (args: string[], date?: string) =>
    execFileSync("git", [...config, ...args], {
      cwd: repo,
      stdio: "ignore",
      env: {
        ...withoutGitEnv(process.env),
        ...(date && { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
      },
    });
  const write = (file: string, text: string) => {
    mkdirSync(join(repo, file, ".."), { recursive: true });
    writeFileSync(join(repo, file), text);
  };
  const commit = (message: string, date: string) => {
    run(["add", "-A"]);
    run(["commit", "-q", "-m", message], date);
  };

  beforeAll(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), "seo-dates-moves-")));
    run(["init", "-q"]);
    write("apps/docs/kept.mdx", "kept\n");
    write("apps/docs/edited.mdx", "edited\n");
    commit("pages", "2026-01-01T00:00:00Z");
    write("apps/docs/later.mdx", "later\n");
    commit("later", "2026-02-01T00:00:00Z");
    // The folder moves; one file is also edited in the same commit.
    run(["mv", "apps/docs", "apps/app"]);
    write("apps/app/edited.mdx", "edited while moving\n");
    commit("move", "2026-03-01T00:00:00Z");
    write("apps/app/later.mdx", "later, changed\n");
    commit("change", "2026-04-01T00:00:00Z");
  });

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  test("a move alone doesn't count as a change", () => {
    const dates = gitLastModified(
      ["apps/app/kept.mdx", "apps/app/edited.mdx", "apps/app/later.mdx"],
      repo,
    );
    expect(dates.get("apps/app/kept.mdx")?.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(dates.get("apps/app/edited.mdx")?.toISOString()).toBe(
      "2026-03-01T00:00:00.000Z",
    );
    expect(dates.get("apps/app/later.mdx")?.toISOString()).toBe(
      "2026-04-01T00:00:00.000Z",
    );
  });

  test("dates a file for fumadocs, by a relative or an absolute path", () => {
    const app = join(repo, "apps/app");
    expect(gitFileDate("kept.mdx", app)?.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(gitFileDate(join(app, "later.mdx"), repo)?.toISOString()).toBe(
      "2026-04-01T00:00:00.000Z",
    );
    expect(gitFileDate("missing.mdx", app)).toBeUndefined();
  });
});

describe("withoutGitEnv", () => {
  it("drops every GIT_* variable a git hook sets, and keeps the rest", () => {
    const env = withoutGitEnv({
      ...process.env,
      GIT_DIR: "/repo/.git",
      GIT_WORK_TREE: "/repo",
      GIT_INDEX_FILE: "/repo/.git/index",
      PATH: "/usr/bin",
    });
    expect(Object.keys(env).filter((name) => name.startsWith("GIT_"))).toEqual(
      [],
    );
    expect(env.PATH).toBe("/usr/bin");
  });
});
