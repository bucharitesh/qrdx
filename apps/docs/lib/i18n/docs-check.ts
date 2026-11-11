// Docs translations for scripts/i18n-check.ts: which pages each language
// has, which are stale, and what blocks publishing. Node only.
//
// messages/review/docs/<locale>.json records, per English file, the hash of
// the English a translation came from and its status. A translation is
// "stale" when the English changed since; `bun run --filter docs i18n:docs`
// redoes it.
import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  LOCALES,
  type Locale,
  type ReviewState,
} from "./config";
import { hasDocs } from "./docs";
import { isPublished, type ReviewTable } from "./review";

export type DocsReviewFile = Record<
  string,
  { source: string; status: "machine" | "reviewed" }
>;

/**
 * Pages that stay English (scripts/i18n-translate-docs.ts SKIP): the API
 * reference, generated from the OpenAPI document. Its sidebar labels
 * (developers/api/meta.json) are translated.
 */
export const UNTRANSLATED_DOCS = [/^developers\/api\/.*\.mdx$/];

/** "help/index.mdx" → "/docs/help"; "(guides)/teams.mdx" → "/docs/teams". */
export function docsPathOfFile(file: string): string {
  const segments = file
    .replace(/\.mdx?$/, "")
    .split("/")
    .filter((segment) => !/^\(.+\)$/.test(segment));
  if (segments.at(-1) === "index") segments.pop();
  return ["/docs", ...segments].join("/");
}

export interface DocsLocaleReport {
  errors: string[];
  warnings: string[];
  counts: {
    pages: number;
    translated: number;
    machine: number;
    reviewed: number;
    stale: number;
    missing: number;
  };
}

export function checkDocsLocale({
  locale,
  english,
  translations,
  review,
  state,
}: {
  locale: Locale;
  /** English content files (relative to content/docs) and their hashes. */
  english: ReadonlyMap<string, string>;
  /** Translation files present for this locale, named after their English file. */
  translations: ReadonlySet<string>;
  review: DocsReviewFile;
  state: ReviewState;
}): DocsLocaleReport {
  const table = { [locale]: state } as unknown as ReviewTable;
  const report: DocsLocaleReport = {
    errors: [],
    warnings: [],
    counts: {
      pages: 0,
      translated: 0,
      machine: 0,
      reviewed: 0,
      stale: 0,
      missing: 0,
    },
  };
  for (const [file, hash] of english) {
    if (UNTRANSLATED_DOCS.some((pattern) => pattern.test(file))) continue;
    const page = file.endsWith(".mdx");
    if (page) report.counts.pages++;
    // A sidebar file is published with the whole language.
    const published = page
      ? isPublished(locale, docsPathOfFile(file), table)
      : state === "reviewed";
    const blocking = (message: string) =>
      (published ? report.errors : report.warnings).push(message);
    if (!translations.has(file)) {
      if (page) {
        report.counts.missing++;
        report.warnings.push(
          `${locale}: ${file} isn't translated (shows in English)`,
        );
      }
      continue;
    }
    if (page) report.counts.translated++;
    const entry = review[file];
    if (!entry) {
      blocking(
        `${locale}: ${file} has no review entry (run i18n:docs --record)`,
      );
      continue;
    }
    if (entry.source !== hash) {
      if (page) report.counts.stale++;
      blocking(
        `${locale}: ${file} is stale (the English changed since it was translated)`,
      );
    } else if (entry.status === "reviewed") {
      if (page) report.counts.reviewed++;
    } else {
      if (page) report.counts.machine++;
      if (published) {
        report.errors.push(
          `${locale}: ${file} is machine-translated, but ${docsPathOfFile(file)} is published (lib/i18n/config.ts review)`,
        );
      }
    }
  }
  for (const file of translations) {
    if (!english.has(file)) {
      report.errors.push(
        `${locale}: the English for ${file} is gone; delete or move the translation`,
      );
    }
  }
  for (const file of Object.keys(review)) {
    if (!english.has(file)) {
      report.warnings.push(
        `${locale}: review entry ${file} has no English file`,
      );
    }
  }
  return report;
}

/**
 * Files named like a translation into a site language without docs
 * (page.fr.mdx): the docs loader would list them as English pages.
 */
export function strayTranslations(files: readonly string[]): string[] {
  const others = LOCALES.filter(
    (locale) => locale !== DEFAULT_LOCALE && !hasDocs(locale),
  );
  return files.flatMap((file) => {
    const locale = others.find((other) =>
      new RegExp(`\\.${other}\\.(mdx?|json)$`).test(file),
    );
    return locale
      ? [
          `${file}: ${LOCALE_INFO[locale].englishName} has no docs (lib/i18n/config.ts, docs: true), so this would show as an English page`,
        ]
      : [];
  });
}
