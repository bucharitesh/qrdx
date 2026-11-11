// The docs in other languages (fumadocs i18n). Client-safe: no server
// imports.
//
// A language has docs when its entry in lib/i18n/config.ts says `docs: true`.
// Its pages are content/docs/<page>.<locale>.mdx beside the English
// <page>.mdx (fumadocs' "dot" parser), and its sidebar folder names are
// meta.<locale>.json beside meta.json. A page that isn't translated yet
// renders the English one at the language's URL, with a note
// (app/[lang]/docs). Languages without docs link to the English docs.
//
// URLs: English keeps /docs/... (rewritten to [lang]=en in next.config.ts);
// the others are /es/docs/..., /pt-br/docs/..., /zh-hans/docs/....
import { defineI18n } from "fumadocs-core/i18n";
import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  LOCALES,
  type Locale,
  localeFromSegment,
} from "./config";

/** English first, then every language with translated docs. */
export const DOCS_LOCALES: readonly Locale[] = LOCALES.filter(
  (locale) => LOCALE_INFO[locale].docs === true,
);

export function hasDocs(locale: Locale): boolean {
  return DOCS_LOCALES.includes(locale);
}

/** The docs language for a URL segment ("pt-br" → "pt-BR"), if it has docs. */
export function docsLocaleFromSegment(
  segment: string | null | undefined,
): Locale | undefined {
  const locale = localeFromSegment(segment);
  return locale && hasDocs(locale) ? locale : undefined;
}

/** "/docs" and "/docs/…", the English paths of docs pages. */
export function isDocsPath(path: string): boolean {
  return path === "/docs" || path.startsWith("/docs/");
}

/** fumadocs' i18n config for the docs loader (lib/source.ts). */
export const docsI18n = defineI18n<Locale>({
  languages: [...DOCS_LOCALES],
  defaultLanguage: DEFAULT_LOCALE,
  hideLocale: "default-locale",
  parser: "dot",
  // A page that isn't translated is the English one (the loader inherits it).
  fallbackLanguage: DEFAULT_LOCALE,
});

/** A docs page's URL: /docs/a/b in English, /pt-br/docs/a/b in Portuguese. */
export function docsUrl(slugs: readonly string[], locale: Locale): string {
  const path = ["", "docs", ...slugs.filter(Boolean)].join("/");
  return locale === DEFAULT_LOCALE
    ? path
    : `/${LOCALE_INFO[locale].segment}${path}`;
}

/** "/es/docs/a" → "/docs/a"; English paths come back as they are. */
export function englishDocsPath(url: string): string {
  const match = /^\/([^/]+)(\/docs(?:\/.*)?)$/.exec(url);
  return match && docsLocaleFromSegment(match[1]) ? (match[2] as string) : url;
}

/**
 * The locale a content file is translated into: "a/b.es.mdx" → "es",
 * "meta.pt-BR.json" → "pt-BR"; undefined for English files.
 */
export function translationLocale(file: string): Locale | undefined {
  const match = /\.([^./]+)\.(?:mdx?|json|ya?ml)$/.exec(file);
  const locale = match?.[1];
  return locale && locale !== DEFAULT_LOCALE && hasDocs(locale as Locale)
    ? (locale as Locale)
    : undefined;
}

/** The English file a translation belongs to: "a/b.es.mdx" → "a/b.mdx". */
export function englishFile(file: string): string {
  const locale = translationLocale(file);
  return locale ? file.replace(`.${locale}.`, ".") : file;
}

/** The translation of an English content file: "a/b.mdx" → "a/b.es.mdx". */
export function translatedFile(file: string, locale: Locale): string {
  return file.replace(/\.(mdx?|json|ya?ml)$/, `.${locale}.$1`);
}

/** The URL segments of every language with docs except English (es|pt-br|…). */
export function translatedDocsSegments(): string[] {
  return DOCS_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map(
    (locale) => LOCALE_INFO[locale].segment,
  );
}

/**
 * next.config.ts rewrites (beforeFiles): English docs URLs to [lang]=en,
 * except their Markdown versions (/docs/a.md, /docs/a.mdx), which the
 * afterFiles rules send to app/llms.mdx.
 */
export function docsEnglishRewrites(): {
  source: string;
  destination: string;
}[] {
  const en = LOCALE_INFO[DEFAULT_LOCALE].segment;
  return [
    { source: "/docs", destination: `/${en}/docs` },
    {
      source: "/docs/:path((?!.*\\.mdx?$).+)",
      destination: `/${en}/docs/:path`,
    },
  ];
}

/**
 * next.config.ts rewrites (afterFiles): a translated docs page as Markdown,
 * /es/docs/a.md (or .mdx) and /es/docs.md, served by app/docs-md.
 */
export function docsMarkdownRewrites(): {
  source: string;
  destination: string;
}[] {
  const segments = translatedDocsSegments();
  if (segments.length === 0) return [];
  const lang = `:lang(${segments.join("|")})`;
  return [
    { source: `/${lang}/docs.md`, destination: "/docs-md/:lang" },
    { source: `/${lang}/docs.mdx`, destination: "/docs-md/:lang" },
    { source: `/${lang}/docs/:path*.md`, destination: "/docs-md/:lang/:path*" },
    {
      source: `/${lang}/docs/:path*.mdx`,
      destination: "/docs-md/:lang/:path*",
    },
  ];
}

/** The same, for requests that ask for text/markdown at the page's own URL. */
export function docsMarkdownAcceptRewrites(): {
  source: string;
  destination: string;
}[] {
  const segments = translatedDocsSegments();
  if (segments.length === 0) return [];
  const lang = `:lang(${segments.join("|")})`;
  return [
    { source: `/${lang}/docs`, destination: "/docs-md/:lang" },
    { source: `/${lang}/docs/:path+`, destination: "/docs-md/:lang/:path+" },
  ];
}
