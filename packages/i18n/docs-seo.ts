// Search-engine rules for docs pages in other languages, the docs version of
// apps/app/lib/i18n/metadata.ts and apps/app/lib/i18n/sitemap.ts.
//
// - A translation a native reviewer signed off (the language's `review` in
//   config.ts, "reviewed" or a list of paths that names the page) is
//   indexed, self-canonical, in the sitemap and in hreflang.
// - A machine translation is `noindex, follow`, self-canonical, and left
//   out of the sitemap and of every page's hreflang.
// - A page that isn't translated shows the English text at the language's
//   URL: `noindex, follow`, canonical to the English page.
//
// Pure functions: callers pass which languages a page is translated into
// (apps/docs/lib/source.ts docsPageLocales), so tests need no content. The
// helpers that write absolute URLs come from createDocsSeo(baseUrl): the app
// passes its own origin (apps/docs/lib/i18n/docs-seo.ts), as this package
// reads no environment.
import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE, LOCALE_INFO, type Locale } from "./config";
import { docsUrl } from "./docs";
import { isPublished, REVIEW, type ReviewTable } from "./review";

/** The languages whose version of the page may be indexed, English first. */
export function indexableDocsLocales(
  slugs: readonly string[],
  translated: readonly Locale[],
  review: ReviewTable = REVIEW
): Locale[] {
  const path = docsUrl(slugs, DEFAULT_LOCALE);
  return [
    DEFAULT_LOCALE,
    ...translated.filter(
      (locale) => locale !== DEFAULT_LOCALE && isPublished(locale, path, review)
    ),
  ];
}

export interface DocsPageSeo {
  canonical: string;
  /** Set when the page must not be indexed. */
  robots?: { index: false; follow: true };
  /** hreflang alternates, only on indexable pages. */
  languages?: Record<string, string>;
  ogLocale: string;
  alternateOgLocales: string[];
  /** The page is English text at another language's URL. */
  fallback: boolean;
}

type Entry = MetadataRoute.Sitemap[number];

/** Translations rank a little below the English page (as apps/app/lib/i18n/sitemap.ts). */
const TRANSLATION_PRIORITY = 0.9;

/**
 * The helpers that write absolute URLs, for a site at `baseUrl` (QRdx's
 * canonical origin in production).
 */
export function createDocsSeo(baseUrl: URL | string) {
  const absolute = (path: string) => new URL(path, baseUrl).toString();

  /** hreflang alternates (plus x-default), or undefined while only English is indexable. */
  function docsLanguageAlternates(
    slugs: readonly string[],
    translated: readonly Locale[],
    review: ReviewTable = REVIEW
  ): Record<string, string> | undefined {
    const locales = indexableDocsLocales(slugs, translated, review);
    if (locales.length < 2) return undefined;
    const languages: Record<string, string> = {};
    for (const locale of locales) {
      for (const tag of LOCALE_INFO[locale].hreflang) {
        languages[tag] = absolute(docsUrl(slugs, locale));
      }
    }
    languages["x-default"] = absolute(docsUrl(slugs, DEFAULT_LOCALE));
    return languages;
  }

  function docsPageSeo({
    slugs,
    locale,
    translated,
    review = REVIEW,
  }: {
    slugs: readonly string[];
    locale: Locale;
    /** The languages the page is translated into (English included). */
    translated: readonly Locale[];
    review?: ReviewTable;
  }): DocsPageSeo {
    const fallback = locale !== DEFAULT_LOCALE && !translated.includes(locale);
    if (fallback) {
      return {
        canonical: absolute(docsUrl(slugs, DEFAULT_LOCALE)),
        robots: { index: false, follow: true },
        ogLocale: LOCALE_INFO[DEFAULT_LOCALE].ogLocale,
        alternateOgLocales: [],
        fallback,
      };
    }
    const indexable = indexableDocsLocales(slugs, translated, review);
    const published = indexable.includes(locale);
    const languages = published
      ? docsLanguageAlternates(slugs, translated, review)
      : undefined;
    return {
      canonical: absolute(docsUrl(slugs, locale)),
      ...(!published && { robots: { index: false, follow: true } as const }),
      ...(languages && { languages }),
      ogLocale: LOCALE_INFO[locale].ogLocale,
      alternateOgLocales: languages
        ? indexable
            .filter((other) => other !== locale)
            .map((other) => LOCALE_INFO[other].ogLocale)
        : [],
      fallback,
    };
  }

  /**
   * A docs page's sitemap entries: the English page, then each translation
   * that may be indexed, all listing each other as alternates. While nothing
   * is reviewed that's the English entry alone, without alternates.
   */
  function docsSitemapEntries(
    slugs: readonly string[],
    translated: readonly Locale[],
    entry: Omit<Entry, "url" | "alternates">,
    review: ReviewTable = REVIEW
  ): Entry[] {
    const languages = docsLanguageAlternates(slugs, translated, review);
    return indexableDocsLocales(slugs, translated, review).map((locale) => ({
      ...entry,
      url: absolute(docsUrl(slugs, locale)),
      ...(locale !== DEFAULT_LOCALE &&
        entry.priority !== undefined && {
          priority:
            Math.round(entry.priority * TRANSLATION_PRIORITY * 100) / 100,
        }),
      ...(languages && { alternates: { languages } }),
    }));
  }

  return { docsLanguageAlternates, docsPageSeo, docsSitemapEntries };
}
