// The docs in other languages (fumadocs i18n). Client-safe: no server
// imports.
//
// A language has docs when its entry in config.ts says `docs: true`. Its
// pages are content/docs/<page>.<locale>.mdx beside the English <page>.mdx
// (fumadocs' "dot" parser), and its sidebar folder names are
// meta.<locale>.json beside meta.json. A page that isn't translated yet
// renders the English one at the language's URL, with a note
// (app/[lang]/docs). Languages without docs link to the English docs.
//
// URLs: English keeps /docs/... (rewritten to [lang]=en in next.config.ts);
// the others are /es/docs/..., /pt-br/docs/..., /zh-hans/docs/....
import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  LOCALES,
  type Locale,
  localeFromSegment,
} from "./config";

/** English first, then every language with translated docs. */
export const DOCS_LOCALES: readonly Locale[] = LOCALES.filter(
  (locale) => LOCALE_INFO[locale].docs === true
);

export function hasDocs(locale: Locale): boolean {
  return DOCS_LOCALES.includes(locale);
}

/** The docs language for a URL segment ("pt-br" → "pt-BR"), if it has docs. */
export function docsLocaleFromSegment(
  segment: string | null | undefined
): Locale | undefined {
  const locale = localeFromSegment(segment);
  return locale && hasDocs(locale) ? locale : undefined;
}

/** "/docs" and "/docs/…", the English paths of docs pages. */
export function isDocsPath(path: string): boolean {
  return path === "/docs" || path.startsWith("/docs/");
}

/**
 * fumadocs' i18n options for the docs loader. An app with the docs passes
 * them to fumadocs' `defineI18n<Locale>()` (apps/docs/lib/i18n/docs.ts), so
 * this package doesn't depend on fumadocs.
 */
export const docsI18nOptions = {
  languages: [...DOCS_LOCALES],
  defaultLanguage: DEFAULT_LOCALE as Locale,
  hideLocale: "default-locale" as const,
  parser: "dot" as const,
  // A page that isn't translated is the English one (the loader inherits it).
  fallbackLanguage: DEFAULT_LOCALE as Locale,
};

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
    (locale) => LOCALE_INFO[locale].segment
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

// ─── The docs zone ───────────────────────────────────────────────────────────
// The docs are a separate Next.js app (apps/docs), served at the same
// URLs on qrdx.dev. The main app proxies the docs' URLs to it with
// docsZoneRewrites() when DOCS_ZONE_URL is set. Without it (self-hosting,
// local development without the docs site), docsOriginRedirects() sends
// them to the same paths on qrdx.dev. The manifest the zones exchange is in
// @repo/next-config/docs-zone.

/** A next.config rewrite: `has` and `missing` as Next takes them. */
export interface ZoneRewrite {
  source: string;
  destination: string;
  has?: RouteCondition[];
  missing?: RouteCondition[];
}

export type RouteCondition =
  | { type: "header" | "cookie" | "query"; key: string; value?: string }
  | { type: "host"; key?: undefined; value: string };

export interface DocsZoneOptions {
  /**
   * URL segments of the languages with translated docs ("es", "pt-br");
   * translatedDocsSegments() unless a test passes its own.
   */
  translatedSegments?: readonly string[];
  /**
   * What makes a request one for Markdown (`Accept: text/markdown` on the
   * main app's own hosts). Those rules come first, so an agent asking for
   * Markdown at a page's URL gets the page's Markdown, as it does today.
   */
  markdown: { has: RouteCondition[]; missing?: RouteCondition[] };
}

/**
 * `url` without its trailing slashes. A loop rather than /\/+$/, which
 * backtracks on every position of a long run of slashes.
 */
function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end--;
  return url.slice(0, end);
}

const langParam = (segments: readonly string[]) =>
  segments.length > 0 ? `:lang(${segments.join("|")})` : null;

/**
 * The main app's beforeFiles rewrites that send the docs to the zone at
 * `zoneUrl` (no trailing slash): the pages in every language and their
 * Markdown versions, the docs' Open Graph images, search, llms-full.txt and
 * the zone's own build assets (its assetPrefix, /docs-static). None when
 * `zoneUrl` is unset: docsOriginRedirects() covers the same URLs then.
 *
 * The .md and .mdx URLs go to the zone as they are; the zone's own
 * next.config maps them to its Markdown routes.
 */
export function docsZoneRewrites(
  zoneUrl: string | undefined,
  options: DocsZoneOptions
): ZoneRewrite[] {
  if (!zoneUrl) return [];
  const zone = withoutTrailingSlashes(zoneUrl);
  const lang = langParam(
    options.translatedSegments ?? translatedDocsSegments()
  );

  const markdown: ZoneRewrite[] = [
    { source: "/docs", destination: `${zone}/llms.mdx` },
    { source: "/docs/:path+", destination: `${zone}/llms.mdx/:path+` },
    ...(lang
      ? [
          { source: `/${lang}/docs`, destination: `${zone}/docs-md/:lang` },
          {
            source: `/${lang}/docs/:path+`,
            destination: `${zone}/docs-md/:lang/:path+`,
          },
        ]
      : []),
  ].map((rule) => ({
    ...rule,
    has: options.markdown.has,
    ...(options.markdown.missing && { missing: options.markdown.missing }),
  }));

  const pages: ZoneRewrite[] = [
    { source: "/docs", destination: `${zone}/docs` },
    { source: "/docs.md", destination: `${zone}/docs.md` },
    { source: "/docs.mdx", destination: `${zone}/docs.mdx` },
    { source: "/docs/:path*", destination: `${zone}/docs/:path*` },
    ...(lang
      ? [
          { source: `/${lang}/docs`, destination: `${zone}/:lang/docs` },
          { source: `/${lang}/docs.md`, destination: `${zone}/:lang/docs.md` },
          {
            source: `/${lang}/docs.mdx`,
            destination: `${zone}/:lang/docs.mdx`,
          },
          {
            source: `/${lang}/docs/:path*`,
            destination: `${zone}/:lang/docs/:path*`,
          },
        ]
      : []),
  ];

  const routes: ZoneRewrite[] = [
    "/llms.mdx/:path*",
    "/docs-md/:path*",
    "/og/docs/:path*",
    "/api/search",
    "/llms-full.txt",
    "/docs-static/:path*",
  ].map((source) => ({ source, destination: `${zone}${source}` }));

  return [...markdown, ...pages, ...routes];
}

/** A next.config redirect: `has` and `missing` as Next takes them. */
export interface DocsRedirect {
  source: string;
  destination: string;
  permanent: false;
  has?: RouteCondition[];
}

/**
 * The main app's redirects when it has no docs site (DOCS_ZONE_URL unset):
 * every docs URL docsZoneRewrites() would proxy, in every language and as
 * Markdown, plus llms-full.txt and the docs' Open Graph images, goes to the
 * same path at `origin` (qrdx.dev), keeping its query. Temporary (307), so a
 * deployment that later gets a docs site serves them itself. Not
 * /api/search, which answers 404 instead (the command menu leaves docs out
 * then), nor /docs-static, which only the docs site's pages load.
 */
export function docsOriginRedirects(
  origin: string,
  options: {
    translatedSegments?: readonly string[];
    /** Conditions every rule carries (the main app's own hosts). */
    has?: RouteCondition[];
  } = {}
): DocsRedirect[] {
  const target = withoutTrailingSlashes(origin);
  const lang = langParam(
    options.translatedSegments ?? translatedDocsSegments()
  );
  const sources = [
    "/docs",
    "/docs.md",
    "/docs.mdx",
    "/docs/:path*",
    ...(lang
      ? [
          `/${lang}/docs`,
          `/${lang}/docs.md`,
          `/${lang}/docs.mdx`,
          `/${lang}/docs/:path*`,
        ]
      : []),
    "/llms.mdx/:path*",
    "/docs-md/:path*",
    "/og/docs/:path*",
    "/llms-full.txt",
  ];
  return sources.map((source) => ({
    source,
    // The path as it came: `/:lang(es|…)/docs` names its parameter `lang`.
    destination: `${target}${source.replace(/^\/:lang\([^)]*\)/, "/:lang")}`,
    permanent: false,
    ...(options.has && { has: options.has }),
  }));
}

/**
 * Whether `href` is a docs page: /docs, /docs/…, and the same under a
 * translated docs language (/es/docs/…). Not their .md or .mdx versions,
 * which are files rather than pages. Query and hash are ignored; external
 * and relative hrefs are never docs pages.
 *
 * Links between the zones must be plain <a> elements (a full page load):
 * next/link would try to load the other zone's page in this app.
 */
export function isDocsPagePath(
  href: string,
  translatedSegments: readonly string[] = translatedDocsSegments()
): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = href.split(/[?#]/, 1)[0] ?? href;
  if (path.endsWith(".md") || path.endsWith(".mdx")) return false;
  // The first segment, and the rest of the path after it.
  const slash = path.indexOf("/", 1);
  const first = slash === -1 ? path.slice(1) : path.slice(1, slash);
  const rest = translatedSegments.includes(first)
    ? slash === -1
      ? ""
      : path.slice(slash)
    : path;
  return rest === "/docs" || rest.startsWith("/docs/");
}
