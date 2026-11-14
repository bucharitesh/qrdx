// Native review gate (owner decision, 2 Nov 2026). Machine translations ship,
// but search engines don't see them until a native speaker signs off:
// until then a locale's pages are `noindex, follow`, left out of the sitemap
// and left out of every page's hreflang alternates (an hreflang link to a
// noindex page is an error).
//
// The state is each locale's `review` in config.ts: set it to "reviewed" and
// all three turn on at the next deploy. A list of paths opens only those
// pages. `bun run --filter docs i18n:check` fails if a locale marked
// "reviewed" still has missing, machine or stale strings
// (apps/docs/messages/review/<locale>.json).
import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  LOCALES,
  type Locale,
  type ReviewState,
  TRANSLATED_LOCALES,
  type TranslatedLocale,
} from "./config";

export type { ReviewState } from "./config";

export type ReviewTable = Record<TranslatedLocale, ReviewState>;

export const REVIEW = Object.fromEntries(
  TRANSLATED_LOCALES.map((locale) => [locale, LOCALE_INFO[locale].review])
) as ReviewTable;

/** True when `path` in `locale` may be indexed (English always may). */
export function isPublished(
  locale: Locale,
  path: string,
  review: ReviewTable = REVIEW
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
  review: ReviewTable = REVIEW
): Locale[] {
  return LOCALES.filter((locale) => isPublished(locale, path, review));
}
