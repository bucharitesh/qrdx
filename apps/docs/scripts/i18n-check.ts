// pnpm --filter docs i18n:check (CI, next to tsc and biome)
//
// Every translated catalog (messages/<locale>.json) against English: no
// missing or extra keys, the same ICU arguments and tags, every number kept,
// a review entry per string, and no machine or stale strings in a locale
// marked "reviewed" (lib/i18n/review.ts). Exit 1 on any error.
//
// Fix a missing or stale string with `pnpm --filter docs i18n:translate
// --locale <locale>` (or --all).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { type Catalog, checkLocale, type ReviewFile } from "@/lib/i18n/catalog";
import { TRANSLATED_LOCALES } from "@/lib/i18n/config";
import { icuShape } from "@/lib/i18n/icu";
import { REVIEW } from "@/lib/i18n/review";

const MESSAGES = path.join(__dirname, "../messages");
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(MESSAGES, file), "utf8")) as T;

const errors: string[] = [];
const warnings: string[] = [];
const english = read<Catalog>("en.json");

// The source itself must parse.
const walk = (catalog: Catalog, prefix = "") => {
  for (const [key, value] of Object.entries(catalog)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value !== "string") walk(value, keyPath);
    else {
      try {
        icuShape(value);
      } catch (error) {
        errors.push(`en: ${keyPath}: ${(error as Error).message}`);
      }
    }
  }
};
walk(english);

for (const locale of TRANSLATED_LOCALES) {
  for (const file of [`${locale}.json`, `review/${locale}.json`]) {
    if (!existsSync(path.join(MESSAGES, file))) {
      errors.push(`messages/${file} is missing`);
    }
  }
  if (errors.some((error) => error.includes(`${locale}.json is missing`))) {
    continue;
  }
  const report = checkLocale({
    locale,
    english,
    catalog: read<Catalog>(`${locale}.json`),
    review: read<ReviewFile>(`review/${locale}.json`),
    state: REVIEW[locale],
  });
  errors.push(...report.errors);
  warnings.push(...report.warnings);
  const { keys, machine, reviewed, stale, missing } = report.counts;
  const state = Array.isArray(REVIEW[locale])
    ? `reviewed pages: ${(REVIEW[locale] as string[]).join(", ")}`
    : REVIEW[locale];
  console.log(
    `${locale.padEnd(8)} ${state.padEnd(9)} ${keys} strings: ${reviewed} reviewed, ${machine} machine, ${stale} stale, ${missing} missing`,
  );
}

for (const warning of warnings) console.warn(`warning: ${warning}`);
if (errors.length > 0) {
  for (const error of errors.slice(0, 50)) console.error(`error: ${error}`);
  if (errors.length > 50) console.error(`…and ${errors.length - 50} more`);
  console.error(
    "\nRun `pnpm --filter docs i18n:translate --all` for missing or stale strings.",
  );
  process.exit(1);
}
console.log("i18n catalogs OK");
