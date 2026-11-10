// Native review gate (owner decision, 2 Nov 2026). Machine translations ship,
// but search engines don't see them until a native speaker signs off:
// until then a locale's pages are `noindex, follow`, left out of the sitemap
// and left out of every page's hreflang alternates (an hreflang link to a
// noindex page is an error).
//
// Flip a locale to "reviewed" here and all three turn on at the next deploy.
// A list of paths opens only those pages. `pnpm i18n:check` fails if a
// locale marked "reviewed" still has machine or stale strings in
// messages/review/<locale>.json.
import {
  DEFAULT_LOCALE,
  LOCALES,
  type Locale,
  type TranslatedLocale,
} from "./config";

export type ReviewState = "machine" | "reviewed" | readonly string[];

export type ReviewTable = Record<TranslatedLocale, ReviewState>;

export const REVIEW: ReviewTable = {
  es: "machine",
  "pt-BR": "machine",
  fr: "machine",
  de: "machine",
  it: "machine",
  ja: "machine",
  ko: "machine",
  "zh-Hans": "machine",
  id: "machine",
  hi: "machine",
};

/** True when `path` in `locale` may be indexed (English always may). */
export function isPublished(
  locale: Locale,
  path: string,
  review: ReviewTable = REVIEW,
): boolean {
  if (locale === DEFAULT_LOCALE) return true;
  const state = review[locale];
  if (state === "reviewed") return true;
  if (state === "machine") return false;
  return state.includes(path);
}

/** The locales whose version of `path` is indexable, English first. */
export function publishedLocales(
  path: string,
  review: ReviewTable = REVIEW,
): Locale[] {
  return LOCALES.filter((locale) => isPublished(locale, path, review));
}
