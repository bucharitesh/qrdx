// Last-modified dates for the sitemap that are real, never the build time.
//
// Dates people write in frontmatter (a blog post's `updated`, a comparison's
// `lastVerified`, a changelog entry's `date`) come first. Git dates fill in
// the rest, from the fumadocs `lastModified` plugin for MDX and from
// `gitLastModified()` here for pages written in TypeScript.
//
// Git dates are only trusted from a complete history. Vercel builds from a
// shallow clone, and in a shallow clone every file that wasn't touched by the
// last few commits shows the date of the oldest commit there (the "shallow
// boundary"). That is why every docs, compare and blog URL in the production
// sitemap carried the deploy date. Dates that match a boundary commit are
// dropped. Setting VERCEL_DEEP_CLONE=true on the Vercel project gives builds
// the full history.
//
// Without it, a dropped date falls back to lib/seo-file-dates.json: each
// source file's last change, read from the full history by
// `bun run --filter app seo:dates` (scripts/seo-dates.ts) and checked in.
// The newer of the build's date and the recorded one wins, so a change the
// shallow clone can see still counts. A file changed after the last refresh,
// and outside the clone's history, keeps its older recorded date: a real
// date, just not the latest one.
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import recordedFileDates from "@/lib/seo-file-dates.json";

/**
 * Newest date per file from `git log --format=commit:%aI --name-status
 * -M100%` (or `--name-only`). A file moved without a change (an exact
 * rename, "R100") keeps the dates of its old path, so moving a folder
 * doesn't date every file in it to the move (apps/docs became apps/app on
 * 2026-11-14). With -M100% a file moved and edited in one commit shows as
 * deleted and added, and that commit is its last change.
 */
export function parseGitLog(stdout: string): Map<string, Date> {
  const dates = new Map<string, Date>();
  // Old path → the path the file has now, from the renames read so far.
  const renamed = new Map<string, string>();
  const now = (file: string) => renamed.get(file) ?? file;
  let current: Date | undefined;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("commit:")) {
      const parsed = new Date(line.slice("commit:".length));
      current = Number.isNaN(parsed.getTime()) ? undefined : parsed;
      continue;
    }
    if (line.length === 0) continue;
    // `--name-status` lines are "M\tpath" or "R100\told\tnew".
    const [status, from, to] = line.includes("\t")
      ? line.split("\t")
      : ["M", line];
    if (status.startsWith("R") && to) {
      renamed.set(from, now(to));
      continue;
    }
    const file = now(from);
    // The log is newest first, so the first date seen for a file wins.
    if (current && !status.startsWith("D") && !dates.has(file)) {
      dates.set(file, current);
    }
  }
  return dates;
}

/**
 * The git date, unless it is a shallow clone's boundary date (when the file's
 * real last change is unknown). `boundary` is null when git isn't available.
 */
export function trustedGitDate(
  date: Date | string | undefined,
  boundary: ReadonlySet<number> | null,
): Date | undefined {
  if (!date || !boundary) return undefined;
  const parsed = new Date(date);
  const time = parsed.getTime();
  if (Number.isNaN(time) || boundary.has(time)) return undefined;
  return parsed;
}

/** The newest of the given dates; undefined when none is a valid date. */
export function latestDate(
  dates: readonly (Date | string | undefined)[],
): Date | undefined {
  const times = dates
    .filter((d): d is Date | string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  return times.length > 0 ? new Date(Math.max(...times)) : undefined;
}

/**
 * The environment without git's own variables. Inside a git hook git sets
 * GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE and more; passed on, they make a
 * child `git` ignore its `cwd` and act on the hook's repository instead.
 */
export function withoutGitEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !name.startsWith("GIT_")),
  ) as NodeJS.ProcessEnv;
}

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      // `cwd` decides the repository, even when called from a git hook.
      env: withoutGitEnv(process.env),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

const boundaryCache = new Map<string, ReadonlySet<number> | null>();

/**
 * Author times of the shallow clone's boundary commits: empty for a complete
 * history, null when this isn't a git checkout (a Docker build, for example).
 */
export function shallowBoundary(
  cwd: string = process.cwd(),
): ReadonlySet<number> | null {
  const cached = boundaryCache.get(cwd);
  if (cached !== undefined) return cached;
  const boundary = readShallowBoundary(cwd);
  boundaryCache.set(cwd, boundary);
  return boundary;
}

function readShallowBoundary(cwd: string): ReadonlySet<number> | null {
  const shallow = git(["rev-parse", "--is-shallow-repository"], cwd)?.trim();
  if (shallow === "false") return new Set();
  if (shallow !== "true") return null;

  const file = git(["rev-parse", "--git-path", "shallow"], cwd)?.trim();
  let shas: string[] = [];
  try {
    shas = file
      ? readFileSync(path.resolve(cwd, file), "utf8")
          .split(/\s+/)
          .filter(Boolean)
      : [];
  } catch {
    shas = [];
  }
  const out = shas.length
    ? git(["show", "-s", "--format=%aI", ...shas], cwd)
    : null;
  // A shallow clone whose boundary can't be read: trust no git date.
  if (!out) return null;
  return new Set(
    out
      .split("\n")
      .filter(Boolean)
      .map((line) => new Date(line).getTime()),
  );
}

/** A fumadocs `lastModified` (a git date) if it can be trusted. */
export function trustedLastModified(
  date: Date | string | undefined,
): Date | undefined {
  return trustedGitDate(date, shallowBoundary());
}

function realPath(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return dir;
  }
}

const rootCache = new Map<string, string | null>();

/** The repository's top folder (symlinks resolved), or null outside git. */
function repositoryRoot(cwd: string): string | null {
  const cached = rootCache.get(cwd);
  if (cached !== undefined) return cached;
  const root = git(["rev-parse", "--show-toplevel"], cwd)?.trim() || null;
  rootCache.set(cwd, root);
  return root;
}

const repositoryCache = new Map<string, ReadonlyMap<string, Date>>();

/**
 * Every file's newest git date in the repository at `root` (paths from the
 * root), following exact renames (parseGitLog). The whole history, not a
 * pathspec: git only pairs a rename when both paths are in the diff. One
 * `git log` per repository and process.
 */
function repositoryDates(root: string): ReadonlyMap<string, Date> {
  const cached = repositoryCache.get(root);
  if (cached) return cached;
  const out = git(
    [
      "-c",
      "core.quotepath=off",
      "log",
      "--format=commit:%aI",
      "--name-status",
      "-M100%",
    ],
    root,
  );
  const dates = out ? parseGitLog(out) : new Map<string, Date>();
  repositoryCache.set(root, dates);
  return dates;
}

/**
 * A file's newest git date, following exact renames; for fumadocs'
 * `lastModified` plugin (source.config.ts), which otherwise dates a moved
 * file by the move. undefined when git has none. Not checked against a
 * shallow clone's boundary: trustedLastModified() does that where it's read.
 */
export function gitFileDate(
  file: string,
  cwd: string = process.cwd(),
): Date | undefined {
  const root = repositoryRoot(cwd);
  if (!root) return undefined;
  // git prints paths from the repository root, with symlinks resolved.
  const base = realPath(cwd);
  return repositoryDates(root).get(
    path.relative(root, path.resolve(base, file)),
  );
}

const fileDatesCache = new Map<string, Map<string, Date>>();

/**
 * Trusted git dates for source files, keyed by the path as given (relative to
 * `cwd`, the app directory in the build, e.g. "lib/qr-types-content.ts").
 * Files with no trusted date are left out. Renames are followed as in
 * gitFileDate().
 */
export function gitLastModified(
  files: readonly string[],
  cwd: string = process.cwd(),
): ReadonlyMap<string, Date> {
  const key = `${cwd}\0${files.join("\n")}`;
  const cached = fileDatesCache.get(key);
  if (cached) return cached;

  const result = new Map<string, Date>();
  fileDatesCache.set(key, result);
  const boundary = shallowBoundary(cwd);
  const root = repositoryRoot(cwd);
  if (!boundary || !root || files.length === 0) return result;

  // git prints paths from the repository root, with symlinks resolved.
  const byRootPath = repositoryDates(root);
  const base = realPath(cwd);
  for (const file of files) {
    const date = byRootPath.get(path.relative(root, path.resolve(base, file)));
    const trusted = trustedGitDate(date, boundary);
    if (trusted) result.set(file, trusted);
  }
  return result;
}

/** File (relative to apps/app) → ISO date of its last commit. */
export type RecordedDates = Readonly<Record<string, string>>;

const RECORDED: RecordedDates = recordedFileDates;

/**
 * A source file's last change: the newer of the build's own git date (pass
 * only a trusted one) and the date recorded in lib/seo-file-dates.json.
 */
export function sourceDate(
  file: string,
  gitDate: Date | undefined,
  recorded: RecordedDates = RECORDED,
): Date | undefined {
  return latestDate([gitDate, recorded[file]]);
}

/** gitLastModified() with the recorded dates filling in what it can't date. */
export function fileLastModified(
  files: readonly string[],
  cwd: string = process.cwd(),
): ReadonlyMap<string, Date> {
  const git = gitLastModified(files, cwd);
  const result = new Map<string, Date>();
  for (const file of files) {
    const date = sourceDate(file, git.get(file));
    if (date) result.set(file, date);
  }
  return result;
}

/**
 * An MDX page's date: fumadocs' `lastModified` (a git date) when it can be
 * trusted, else the recorded date of `file` (relative to apps/app).
 */
export function contentLastModified(
  file: string,
  lastModified: Date | string | undefined,
): Date | undefined {
  return sourceDate(file, trustedLastModified(lastModified));
}
