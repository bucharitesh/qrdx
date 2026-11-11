// Which pages exist in every language, and their URLs. Client-safe.
//
// A page is translated once it lives under app/[lang] and its path is in
// localized-paths.json (scripts/i18n-split-roots.mjs moves it there). Links
// to any other page stay unprefixed in every language. The docs are the
// exception: in a language with docs (lib/i18n/docs.ts) every /docs page has
// a prefixed URL; French visitors reach the English docs at /docs.

import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  type Locale,
  localeFromSegment,
} from "./config";
import { hasDocs, isDocsPath } from "./docs";
import localized from "./localized-paths.json";

/**
 * Translated pages, as their route paths. Dynamic segments are written the
 * way their folders are named: "/compare/[slug]" matches one segment there
 * ("/compare/qr-tiger"), "[...slug]" one or more, "[[...slug]]" none or
 * more. A slug that doesn't exist still 404s, in every language.
 */
export const LOCALIZED_PATHS: readonly string[] = localized.paths;

const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "/compare/[slug]" → /^\/compare\/[^/]+$/; plain paths match only themselves. */
export function routeMatcher(route: string): (path: string) => boolean {
  if (!route.includes("[")) return (path) => path === route;
  const pattern = route
    .split("/")
    .map((segment, index) => {
      if (index === 0) return "";
      if (/^\[\[\.\.\.[^/[\]]+\]\]$/.test(segment)) return "(?:/[^?#]*)?";
      if (/^\[\.\.\.[^/[\]]+\]$/.test(segment)) return "/[^?#]+";
      if (/^\[[^/[\].]+\]$/.test(segment)) return "/[^/?#]+";
      return `/${escapeRegex(segment)}`;
    })
    .join("");
  const regex = new RegExp(`^${pattern || "/"}$`);
  return (path) => regex.test(path);
}

const MATCHERS = LOCALIZED_PATHS.map(routeMatcher);

export function isLocalizedPath(path: string): boolean {
  return MATCHERS.some((matches) => matches(path));
}

/**
 * Whether `path` has its own URL in `locale`: a translated page, or a docs
 * page in a language with docs (lib/i18n/docs.ts). Docs pages that aren't
 * translated yet show the English text at that URL, with a note.
 */
export function isPathIn(path: string, locale: Locale): boolean {
  return isLocalizedPath(path) || (isDocsPath(path) && hasDocs(locale));
}

/** "/pricing" in Spanish → "/es/pricing"; "/" → "/es". English is unprefixed. */
export function localizePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE || !isPathIn(path, locale)) return path;
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
 * Only translated pages carry a prefix (docs pages: in languages with docs).
 */
export function splitLocale(pathname: string): {
  locale: Locale;
  path: string;
} {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  const locale = localeFromSegment(match?.[1]);
  if (match && locale && locale !== DEFAULT_LOCALE) {
    const path = match[2] ?? "/";
    if (isPathIn(path, locale)) return { locale, path };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}
