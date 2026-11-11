#!/usr/bin/env node
// Splits apps/docs/app into two root layouts (i18n design §3 and §10):
//
//   app/[lang]/   translated public pages (lib/i18n/localized-paths.json),
//                 each under app/[lang]/(home)/…
//   app/(app)/    every other page, layout and boundary, URLs unchanged
//   app/          route handlers and metadata files stay where they are
//
// Then it repairs every import and every "app/…" path string that pointed at
// a moved file. It is idempotent: run it again after a rebase (or after
// adding a path to localized-paths.json) and it moves only what is still in
// the old place, then fixes only the references that no longer resolve.
//
//   node scripts/i18n-split-roots.mjs            apply
//   node scripts/i18n-split-roots.mjs --dry-run  print what would change
//   node scripts/i18n-split-roots.mjs --check    exit 1 if anything would change
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DOCS = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(DOCS, "../..");
const APP = path.join(DOCS, "app");
const APP_ROOT = "(app)";
const LANG_ROOT = "[lang]";
const HOME = "(home)";
const SELF = path.resolve(import.meta.filename);

const flags = new Set(process.argv.slice(2));
const DRY = flags.has("--dry-run") || flags.has("--check");
const CHECK = flags.has("--check");

const { paths: LOCALIZED_PATHS } = JSON.parse(
  fs.readFileSync(path.join(DOCS, "lib/i18n/localized-paths.json"), "utf8"),
);

// Files that need a root layout above them (Next's UI file conventions).
const UI_FILE =
  /^(?:page|layout|template|loading|error|not-found|default|forbidden|unauthorized)\.(?:[jt]sx?|mdx)$/;
const ROUTE_FILE = /^route\.[jt]sx?$/;
const PAGE_FILE = /^page\.(?:[jt]sx?|mdx)$/;

const changes = { moves: [], rewrites: new Map() };
const rel = (p) => path.relative(REPO, p);
const exists = (p) => fs.existsSync(p);
const isDir = (p) => exists(p) && fs.statSync(p).isDirectory();
const entries = (dir) =>
  isDir(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];

/** What a directory holds: UI files, route handlers, pages. */
function scan(dir, out = { ui: false, route: false, page: false }) {
  for (const entry of entries(dir)) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(p, out);
    else {
      if (UI_FILE.test(entry.name)) out.ui = true;
      if (ROUTE_FILE.test(entry.name)) out.route = true;
      if (PAGE_FILE.test(entry.name)) out.page = true;
    }
  }
  return out;
}

function git(...args) {
  return execFileSync("git", args, { cwd: REPO, stdio: "pipe" }).toString();
}

/** Moves a file or folder, merging into a folder that already exists. */
function move(from, to) {
  if (!exists(from)) return;
  if (exists(to)) {
    if (isDir(from) && isDir(to)) {
      for (const entry of entries(from)) {
        move(path.join(from, entry.name), path.join(to, entry.name));
      }
      if (!DRY && entries(from).length === 0) fs.rmdirSync(from);
      return;
    }
    throw new Error(
      `Both ${rel(from)} and ${rel(to)} exist: merge them by hand, then re-run.`,
    );
  }
  changes.moves.push([from, to]);
  if (DRY) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    git("mv", from, to);
  } catch {
    // Untracked files (or no git): a plain rename.
    fs.renameSync(from, to);
  }
}

// 1. Every folder with a page or layout in it moves under app/(app) whole,
//    route handlers included (they work under a route group). app/api is
//    the route-handler tree: only its page subtrees move.
const SPLIT_ONLY = new Set(["api"]);

function planDir(from, to, split = false) {
  const found = scan(from);
  if (!found.ui) return;
  if (!(split && found.route)) return move(from, to);
  for (const entry of entries(from)) {
    const childFrom = path.join(from, entry.name);
    const childTo = path.join(to, entry.name);
    if (entry.isDirectory()) planDir(childFrom, childTo, true);
    else if (UI_FILE.test(entry.name)) move(childFrom, childTo);
  }
}

for (const entry of entries(APP)) {
  if (entry.name === APP_ROOT || entry.name === LANG_ROOT) continue;
  const from = path.join(APP, entry.name);
  const to = path.join(APP, APP_ROOT, entry.name);
  if (entry.isDirectory()) planDir(from, to, SPLIT_ONLY.has(entry.name));
  else if (UI_FILE.test(entry.name)) move(from, to);
}

// 2. Translated pages move from app/(app)/(home) to app/[lang]/(home): the
//    page and the files beside it, plus folders without a page of their own
//    (components). Sub-pages that aren't translated yet stay behind.
const homeFrom =
  DRY && !isDir(path.join(APP, APP_ROOT, HOME))
    ? path.join(APP, HOME)
    : path.join(APP, APP_ROOT, HOME);
const homeTo = path.join(APP, LANG_ROOT, HOME);
for (const urlPath of LOCALIZED_PATHS) {
  const dir = urlPath === "/" ? "" : urlPath.slice(1);
  const from = path.join(homeFrom, dir);
  const to = path.join(homeTo, dir);
  for (const entry of entries(from)) {
    const childFrom = path.join(from, entry.name);
    const childTo = path.join(to, entry.name);
    if (urlPath === "/") {
      // The home folder holds every other marketing page and their layout.
      if (entry.isFile() && PAGE_FILE.test(entry.name))
        move(childFrom, childTo);
    } else if (entry.isFile() || !scan(childFrom).page) {
      move(childFrom, childTo);
    }
  }
  if (!DRY && dir && isDir(from) && entries(from).length === 0) {
    fs.rmdirSync(from);
  }
}

// 3. References. A path under app/ that no longer exists is looked up under
//    app/[lang] and app/(app); translated pages prefer [lang], the rest
//    (app). Only rewrites to a path that exists are made.
const MODULE_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".jsx",
  ".mjs",
  ".json",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];
const resolvesAsModule = (abs) =>
  MODULE_EXTENSIONS.some((ext) => exists(abs + ext) && !isDir(abs + ext));
const resolvesAsPath = (abs) => exists(abs);

/** "(app)/x" and "[lang]/x" are both the logical path "x". */
function logical(appRelative) {
  const parts = appRelative.split("/");
  return (
    parts[0] === APP_ROOT || parts[0] === LANG_ROOT ? parts.slice(1) : parts
  ).join("/");
}

function isTranslated(logicalPath) {
  return LOCALIZED_PATHS.some((urlPath) => {
    if (urlPath === "/")
      return /^\(home\)\/page(?:\.[jt]sx?)?$/.test(logicalPath);
    const dir = `${HOME}${urlPath}`;
    return logicalPath === dir || logicalPath.startsWith(`${dir}/`);
  });
}

/** Where a missing app/ path lives now (absolute), or null. */
function relocate(abs, resolves) {
  const fromApp = path.relative(APP, abs);
  if (fromApp.startsWith("..") || path.isAbsolute(fromApp)) return null;
  const l = logical(fromApp.split(path.sep).join("/"));
  const roots = isTranslated(l)
    ? [LANG_ROOT, APP_ROOT, ""]
    : [APP_ROOT, LANG_ROOT, ""];
  for (const root of roots) {
    const candidate = path.join(APP, root, l);
    if (candidate !== abs && resolves(candidate)) return candidate;
  }
  return null;
}

/** The file's location before the split (the same if it never moved). */
function originalLocation(file) {
  const fromApp = path.relative(APP, file);
  if (fromApp.startsWith("..")) return file;
  return path.join(APP, logical(fromApp.split(path.sep).join("/")));
}

const toSpecifier = (fromFile, target) => {
  let spec = path
    .relative(path.dirname(fromFile), target)
    .split(path.sep)
    .join("/");
  if (!spec.startsWith(".")) spec = `./${spec}`;
  return spec;
};

const ALIAS = /(["'])@\/app\/([^"'\s]+)\1/g;
const RELATIVE =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\b(?:vi|jest)\.(?:mock|doMock|unmock|importActual|importMock)\s*\(\s*|\bmock\.module\s*\(\s*)(["'])(\.{1,2}\/[^"']*)\2/g;

function fixImports(file, text) {
  let out = text.replace(ALIAS, (match, quote, rest) => {
    const abs = path.join(APP, rest);
    if (resolvesAsModule(abs)) return match;
    const moved = relocate(abs, resolvesAsModule);
    if (!moved) return match;
    const next = path.relative(APP, moved).split(path.sep).join("/");
    return `${quote}@/app/${next}${quote}`;
  });
  out = out.replace(RELATIVE, (match, lead, quote, spec) => {
    const here = path.resolve(path.dirname(file), spec);
    if (resolvesAsModule(here)) return match;
    const before = path.resolve(path.dirname(originalLocation(file)), spec);
    const target = resolvesAsModule(before)
      ? before
      : (relocate(before, resolvesAsModule) ??
        relocate(here, resolvesAsModule));
    if (!target) return match;
    // `target` keeps the specifier's form (with or without an extension).
    return `${lead}${quote}${toSpecifier(file, target)}${quote}`;
  });
  return out;
}

// "app/(home)/pricing/page.tsx", "../../app/admin", "apps/docs/app/…" in
// tests, page source lists and contributor docs, and the segments of
// path.join("app", "(home)", "pricing"). Only rewritten when the new path
// exists.
const PATH_STRING =
  /(?<![\w@.\-/])((?:\.{1,2}\/)*(?:apps\/docs\/)?app\/)([^\s"'`,;*{}<>|\\$]+)/g;
const PATH_SEGMENTS = /(["'])app\1((?:\s*,\s*["'][^"'\n]+["'])+)/g;

function fixPathStrings(text) {
  const out = text.replace(PATH_STRING, (match, prefix, rest) => {
    let candidate = rest;
    for (let i = 0; i < 3; i++) {
      const abs = path.join(APP, candidate);
      if (resolvesAsPath(abs)) return match;
      const moved = relocate(abs, resolvesAsPath);
      if (moved) {
        const next = path.relative(APP, moved).split(path.sep).join("/");
        const slash = candidate.endsWith("/") ? "/" : "";
        return `${prefix}${next}${slash}${rest.slice(candidate.length)}`;
      }
      const trimmed = candidate.replace(/[).:/]+$/, "");
      if (trimmed === candidate) break;
      candidate = trimmed;
    }
    return match;
  });
  return out.replace(PATH_SEGMENTS, (match, quote, list) => {
    const segments = [...list.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
    const whole = path.join(APP, ...segments);
    if (resolvesAsPath(whole) || resolvesAsPath(path.join(APP, segments[0]))) {
      return match;
    }
    // The full path (a file), else its first folder (a path built further on).
    const moved =
      relocate(whole, resolvesAsPath) ??
      relocate(path.join(APP, segments[0]), resolvesAsPath);
    if (!moved) return match;
    const root = path.relative(APP, moved).split(path.sep)[0];
    const separator = /^(\s*,\s*)/.exec(list)?.[1] ?? ", ";
    return `${quote}app${quote}${separator}${quote}${root}${quote}${list}`;
  });
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".source",
  ".turbo",
  "dist",
  "public",
  "messages",
]);
const CODE = /\.(?:[cm]?[jt]sx?)$/;
const TEXT = /\.(?:[cm]?[jt]sx?|mdx?|json)$/;

function walk(dir, out = []) {
  for (const entry of entries(dir)) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (TEXT.test(entry.name)) out.push(p);
  }
  return out;
}

const files = [
  ...walk(DOCS),
  ...["AGENTS.md", "CONTRIBUTING.md", "README.md"].map((f) =>
    path.join(REPO, f),
  ),
].filter(
  (f) =>
    exists(f) &&
    f !== SELF &&
    // Written by `next dev`; not ours to edit.
    f !== path.join(DOCS, "AGENTS.md"),
);

for (const file of files) {
  // In a dry run the moves haven't happened; references are checked later.
  if (DRY && changes.moves.length > 0) break;
  const text = fs.readFileSync(file, "utf8");
  let next = CODE.test(file) ? fixImports(file, text) : text;
  next = fixPathStrings(next);
  if (next !== text) {
    changes.rewrites.set(file, next);
    if (!DRY) fs.writeFileSync(file, next);
  }
}

// Longer paths can wrap lines and reorder imports: format what changed.
const formattable = [...changes.rewrites.keys()].filter((f) =>
  /\.(?:[cm]?[jt]sx?|json)$/.test(f),
);
if (!DRY && formattable.length > 0) {
  // Biome comes with the root's Ultracite setup (Bun hoists it there).
  const biome = [
    path.join(REPO, "node_modules/.bin/biome"),
    path.join(DOCS, "node_modules/.bin/biome"),
  ].find((bin) => exists(bin));
  try {
    if (!biome) throw new Error("no Biome binary: run bun install");
    execFileSync(
      biome,
      ["check", "--write", "--linter-enabled=false", ...formattable],
      { cwd: DOCS, stdio: "pipe" },
    );
  } catch (error) {
    console.warn(
      `biome could not format every rewritten file:\n${error.stdout ?? error}`,
    );
  }
}

for (const [from, to] of changes.moves) {
  console.log(`move     ${rel(from)} -> ${rel(to)}`);
}
for (const file of changes.rewrites.keys()) {
  console.log(`rewrite  ${rel(file)}`);
}
console.log(
  `\n${DRY ? "Would make" : "Made"} ${changes.moves.length} move(s) and ${changes.rewrites.size} reference fix(es).` +
    (DRY && changes.moves.length > 0
      ? " References are checked after the moves; run without --dry-run."
      : ""),
);
if (CHECK && (changes.moves.length > 0 || changes.rewrites.size > 0)) {
  process.exit(1);
}
