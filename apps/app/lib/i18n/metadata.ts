// Metadata for translated pages: a self-referencing canonical per language,
// hreflang alternates for every indexable language plus x-default, og:locale
// with its alternates, and `noindex, follow` until a native reviewer signs
// the language off (lib/i18n/review.ts).
import type { Metadata } from "next";
import { baseUrl, createMetadata } from "@/lib/metadata";
import { LOCALE_INFO, type Locale } from "./config";
import { localizePath } from "./paths";
import {
  isPublished,
  publishedLocales,
  REVIEW,
  type ReviewTable,
} from "./review";

const absolute = (path: string) => new URL(path, baseUrl).toString();

/**
 * hreflang alternates for a translated page, keyed by hreflang value, with
 * x-default on the English URL. Undefined while no other language is
 * indexable: a set that names only English says nothing.
 */
export function alternateLanguages(
  path: string,
  review: ReviewTable = REVIEW,
): Record<string, string> | undefined {
  const locales = publishedLocales(path, review);
  if (locales.length < 2) return undefined;
  const languages: Record<string, string> = {};
  for (const locale of locales) {
    for (const tag of LOCALE_INFO[locale].hreflang) {
      languages[tag] = absolute(localizePath(path, locale));
    }
  }
  languages["x-default"] = absolute(path);
  return languages;
}

export interface LocalizedMetadataInput extends Metadata {
  locale: Locale;
  /** The page's English path, e.g. "/pricing". */
  path: string;
  /** Set when the segment has its own opengraph-image.tsx (see createMetadata). */
  ownOgImage?: boolean;
  /** For tests: the review table to apply. */
  review?: ReviewTable;
}

export function localizedMetadata({
  locale,
  path,
  review = REVIEW,
  ...override
}: LocalizedMetadataInput): Metadata {
  const metadata = createMetadata({
    ...override,
    path: localizePath(path, locale),
  });
  const published = isPublished(locale, path, review);
  // A page that may not be indexed claims no translations, and indexable
  // pages never point at it.
  const languages = published ? alternateLanguages(path, review) : undefined;
  const alternateLocales = languages
    ? publishedLocales(path, review)
        .filter((other) => other !== locale)
        .map((other) => LOCALE_INFO[other].ogLocale)
    : [];

  return {
    ...metadata,
    ...(!published && { robots: { index: false, follow: true } }),
    alternates: {
      ...metadata.alternates,
      ...(languages && { languages }),
    },
    openGraph: {
      ...metadata.openGraph,
      locale: LOCALE_INFO[locale].ogLocale,
      ...(alternateLocales.length > 0 && { alternateLocale: alternateLocales }),
    },
  };
}
