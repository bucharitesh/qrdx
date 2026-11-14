// Writes lib/seo-file-dates.json: the last commit date of every English docs
// page (content/docs), read from the full git history. Builds from a shallow
// clone can't date files the clone has no history for, and fall back to
// these (lib/seo-dates.ts). The main app keeps its own for its pages
// (`bun run --filter app seo:dates`).
//
//   bun run --filter docs seo:dates
//
// Run it from a full clone (`git fetch --unshallow` first if needed) and
// commit the result now and then; dates only ever move forward.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { translationLocale } from "@repo/i18n/docs";
import { gitLastModified, withoutGitEnv } from "@/lib/seo-dates";

const app = path.resolve(import.meta.dirname, "..");
const out = path.join(app, "lib/seo-file-dates.json");

const git = (args: string[]) =>
  execFileSync("git", args, {
    cwd: app,
    env: withoutGitEnv(process.env),
    encoding: "utf8",
  }).trim();

if (git(["rev-parse", "--is-shallow-repository"]) !== "false") {
  console.error(
    "seo:dates needs the full git history. Run `git fetch --unshallow` and try again.",
  );
  process.exit(1);
}

const files = git(["ls-files", "content/docs"])
  .split("\n")
  .filter((file) => file.endsWith(".mdx") && !translationLocale(file));
const dates = gitLastModified(files, app);
const sorted = Object.fromEntries(
  [...dates]
    .map(([file, date]) => [file, date.toISOString()] as const)
    .sort(([a], [b]) => a.localeCompare(b, "en")),
);
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(
  `Wrote ${Object.keys(sorted).length} of ${files.length} file dates to ${path.relative(process.cwd(), out)}.`,
);
