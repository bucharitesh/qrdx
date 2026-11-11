// Which pages exist in every language, and their URLs. Client-safe.
//
// A page is translated once it lives under app/[lang] and its path is in
// localized-paths.json (scripts/i18n-split-roots.mjs moves it there). Links
// to any other page stay unprefixed in every language: Spanish visitors
// reach the English docs at /docs, never a /es/docs that doesn't exist.

import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  type Locale,
  localeFromSegment,
} from "./config";
import localized from "./localized-paths.json";

export const LOCALIZED_PATHS: readonly string[] = localized.paths;

export function isLocalizedPath(path: string): boolean {
  return LOCALIZED_PATHS.includes(path);
}

/** "/pricing" in Spanish → "/es/pricing"; "/" → "/es". English is unprefixed. */
export function localizePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE || !isLocalizedPath(path)) return path;
  const prefix = `/${LOCALE_INFO[locale].segment}`;
  return path === "/" ? prefix : `${prefix}${path}`;
}

/**
 * A link's href for a page in `locale`: prefixed only when the page exists
 * in that language. Keeps any query and hash; leaves external links,
 * mailto:, anchors and relative hrefs alone.
 */
export function localizeHref(href: string, locale: Locale): string {
  if (
    locale === DEFAULT_LOCALE ||
    !href.startsWith("/") ||
    href.startsWith("//")
  ) {
    return href;
  }
  const end = href.search(/[?#]/);
  const path = end === -1 ? href : href.slice(0, end);
  const rest = end === -1 ? "" : href.slice(end);
  return `${localizePath(path, locale)}${rest}`;
}

/**
 * Splits a pathname into its language and the page's English path:
 * "/es/pricing" → { locale: "es", path: "/pricing" }, "/docs" → English.
 * Only translated pages carry a prefix; "/es/docs" isn't one.
 */
export function splitLocale(pathname: string): {
  locale: Locale;
  path: string;
} {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  const locale = localeFromSegment(match?.[1]);
  if (match && locale && locale !== DEFAULT_LOCALE) {
    const path = match[2] ?? "/";
    if (isLocalizedPath(path)) return { locale, path };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}
