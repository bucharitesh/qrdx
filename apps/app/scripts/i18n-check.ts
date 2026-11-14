// bun run --filter app i18n:check [--verbose]   (CI, next to tsc and biome)
//
// Every catalog in packages/i18n/config.ts (messages/<locale>.json) against
// English. Errors (exit 1): a missing catalog file, keys English doesn't
// have, changed ICU arguments or tags, dropped numbers, and, in a locale
// marked "reviewed", any missing, unrecorded, machine or stale string.
// Warnings (listed with --verbose): the same gaps in a locale that isn't
// reviewed yet, where they show in English and the pages stay noindex.
//
// The content catalogs (copy in TypeScript data, lib/i18n/content.ts) get
// the same treatment: messages/content/<locale>.json against the English
// in lib/i18n/content-sources.ts, numbers checked, gaps warned about.
//
// Fill gaps with `bun run --filter app i18n:translate --locale <locale>`, or
// translate by hand and record it with `i18n:translate --record`.
import "./i18n-env";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  type Catalog,
  checkContent,
  checkLocale,
  type ReviewFile,
} from "@/lib/i18n/catalog";
import { TRANSLATED_LOCALES } from "@/lib/i18n/config";
import type { TranslationMemory } from "@/lib/i18n/content";
import { contentEnglish } from "@/lib/i18n/content-sources";
import {
  DOCS_LOCALES,
  englishFile,
  hasDocs,
  translationLocale,
} from "@/lib/i18n/docs";
import {
  checkDocsLocale,
  type DocsReviewFile,
  strayTranslations,
} from "@/lib/i18n/docs-check";
import { icuShape } from "@/lib/i18n/icu";
import { fileHash } from "@/lib/i18n/mdx";
import { REVIEW } from "@/lib/i18n/review";

const VERBOSE = process.argv.includes("--verbose");

const MESSAGES = path.join(__dirname, "../messages");
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(MESSAGES, file), "utf8")) as T;

const errors: string[] = [];
const warnings: string[] = [];
const english = read<Catalog>("en.json");
const withoutDocs = ({ docs: _docs, ...rest }: Catalog): Catalog => rest;

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
  if (!existsSync(path.join(MESSAGES, `${locale}.json`))) {
    errors.push(
      `messages/${locale}.json is missing (start it with {} and translate)`,
    );
    continue;
  }
  // Written by i18n:translate; a hand translation records it with --record.
  const reviewFile = `review/${locale}.json`;
  const reviewEntries = existsSync(path.join(MESSAGES, reviewFile))
    ? read<ReviewFile>(reviewFile)
    : {};
  const report = checkLocale({
    locale,
    // The docs chrome (`docs`) only shows in languages with docs.
    english: hasDocs(locale) ? english : withoutDocs(english),
    catalog: read<Catalog>(`${locale}.json`),
    review: reviewEntries,
    state: REVIEW[locale],
  });
  errors.push(...report.errors);
  warnings.push(...report.warnings);
  const { keys, machine, reviewed, stale, missing } = report.counts;
  const review = REVIEW[locale];
  const state =
    typeof review === "string"
      ? review
      : `reviewed pages: ${review.join(", ")}`;
  console.log(
    `${locale.padEnd(8)} ${state.padEnd(9)} ${keys} strings: ${reviewed} reviewed, ${machine} machine, ${stale} stale, ${missing} missing`,
  );
}

// Docs translations: content/docs/<page>.<locale>.mdx and meta.<locale>.json
// beside the English files, recorded in messages/review/docs/<locale>.json
// (lib/i18n/docs-check.ts).
const DOCS = path.join(__dirname, "../content/docs");
const docsFiles: string[] = [];
const walkDocs = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walkDocs(full);
    else docsFiles.push(path.relative(DOCS, full).split(path.sep).join("/"));
  }
};
walkDocs(DOCS);
const isContent = (file: string) =>
  file.endsWith(".mdx") || /(?:^|\/)meta(?:\.[^./]+)?\.json$/.test(file);
const englishDocs = new Map(
  docsFiles
    .filter((file) => isContent(file) && !translationLocale(file))
    .map((file) => [
      file,
      fileHash(readFileSync(path.join(DOCS, file), "utf8")),
    ]),
);
errors.push(...strayTranslations(docsFiles));
for (const locale of DOCS_LOCALES) {
  if (locale === "en") continue;
  const reviewPath = path.join(MESSAGES, `review/docs/${locale}.json`);
  const report = checkDocsLocale({
    locale,
    english: englishDocs,
    translations: new Set(
      docsFiles
        .filter((file) => isContent(file) && translationLocale(file) === locale)
        .map(englishFile),
    ),
    review: existsSync(reviewPath)
      ? (JSON.parse(readFileSync(reviewPath, "utf8")) as DocsReviewFile)
      : {},
    state: REVIEW[locale as keyof typeof REVIEW],
  });
  errors.push(...report.errors);
  warnings.push(...report.warnings);
  const { pages, translated, machine, reviewed, stale, missing } =
    report.counts;
  console.log(
    `docs ${locale.padEnd(8)} ${translated} of ${pages} pages translated: ${reviewed} reviewed, ${machine} machine, ${stale} stale, ${missing} in English`,
  );
}

// Content: one translation memory per locale, against the sources' English.
const contentStrings = contentEnglish();
for (const locale of TRANSLATED_LOCALES) {
  const file = `content/${locale}.json`;
  const memory = existsSync(path.join(MESSAGES, file))
    ? read<TranslationMemory>(file)
    : {};
  const report = checkContent({
    locale,
    english: contentStrings,
    memory,
    state: REVIEW[locale],
  });
  errors.push(...report.errors);
  warnings.push(...report.warnings);
  const { strings, machine, reviewed, missing, unused } = report.counts;
  console.log(
    `${locale.padEnd(8)} content   ${strings} strings: ${reviewed} reviewed, ${machine} machine, ${missing} missing, ${unused} unused`,
  );
}

if (VERBOSE)
  for (const warning of warnings) console.warn(`warning: ${warning}`);
else if (warnings.length > 0) {
  console.warn(
    `${warnings.length} warning(s) in locales not reviewed yet; --verbose lists them.`,
  );
}
if (errors.length > 0) {
  for (const error of errors.slice(0, 50)) console.error(`error: ${error}`);
  if (errors.length > 50) console.error(`…and ${errors.length - 50} more`);
  console.error(
    "\nFix the strings above. For missing or stale ones: `bun run --filter app i18n:translate --locale <locale>` (CONTRIBUTING.md, Translating QRdx).",
  );
  process.exit(1);
}
console.log("i18n catalogs OK");
