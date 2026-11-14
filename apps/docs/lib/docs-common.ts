// What lib/source.ts (the compiled docs, for the docs pages) and
// lib/docs-index.ts (the docs index, for route handlers) share, so both list
// the same pages at the same URLs. No content is read here.
import type { Locale } from "@/lib/i18n/config";
import {
  DOCS_LOCALES,
  docsI18n,
  docsUrl,
  translationLocale,
} from "@/lib/i18n/docs";

/** fumadocs `loader()` options for the English docs. */
export const docsLoaderOptions = { baseUrl: "/docs" };

/** fumadocs `loader()` options for the docs in every language with docs. */
export const localizedDocsLoaderOptions = {
  baseUrl: "/docs",
  i18n: docsI18n,
  url: (slugs: string[], locale?: string) =>
    docsUrl(slugs, (locale ?? "en") as Locale),
};

/** Whether a page is a translation, not the English page shown as a fallback. */
export function isTranslatedPage(page: { path: string }): boolean {
  return translationLocale(page.path) !== undefined;
}

/** The languages a docs page is translated into, English first. */
export function pageLocales(
  docs: {
    getPage(slugs: string[], locale: Locale): { path: string } | undefined;
  },
  slugs: string[],
): Locale[] {
  return DOCS_LOCALES.filter((locale) => {
    const page = docs.getPage(slugs, locale);
    return page !== undefined && (locale === "en" || isTranslatedPage(page));
  });
}

/** A docs page's Open Graph image, served by app/og/docs/[...slug]. */
export function getPageImage(page: { slugs: string[] }) {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: `/og/docs/${segments.join("/")}`,
  };
}
