// The docs zone: the docs are a separate Next.js app (apps/docs-site),
// served at the same URLs on qrdx.dev. The main app proxies the docs' paths
// to it with rewrites (docsZoneRewrites) once DOCS_ZONE_URL is set; until
// then the main app serves its own copy of the docs. Pure and client-safe:
// next.config.ts and both apps' link components import it.
//
// The languages with translated docs come in as their URL segments ("es",
// "pt-br"), from each app's lib/i18n/docs.ts translatedDocsSegments().

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
  /** URL segments of the languages with translated docs ("es", "pt-br"). */
  translatedSegments: readonly string[];
  /**
   * What makes a request one for Markdown (`Accept: text/markdown` on the
   * main app's own hosts). Those rules come first, so an agent asking for
   * Markdown at a page's URL gets the page's Markdown, as it does today.
   */
  markdown: { has: RouteCondition[]; missing?: RouteCondition[] };
}

const langParam = (segments: readonly string[]) =>
  segments.length > 0 ? `:lang(${segments.join("|")})` : null;

/**
 * The main app's beforeFiles rewrites that send the docs to the zone at
 * `zoneUrl` (no trailing slash): the pages in every language and their
 * Markdown versions, the docs' Open Graph images, search, llms-full.txt and
 * the zone's own build assets (its assetPrefix, /docs-static). None when
 * `zoneUrl` is unset: the main app keeps serving its own docs.
 *
 * The .md and .mdx URLs go to the zone as they are; the zone's own
 * next.config maps them to its Markdown routes.
 */
export function docsZoneRewrites(
  zoneUrl: string | undefined,
  options: DocsZoneOptions
): ZoneRewrite[] {
  if (!zoneUrl) return [];
  const zone = zoneUrl.replace(/\/+$/, "");
  const lang = langParam(options.translatedSegments);

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
  translatedSegments: readonly string[]
): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const path = href.split(/[?#]/, 1)[0] ?? href;
  if (/\.mdx?$/.test(path)) return false;
  const match = /^\/([^/]+)(\/.*)?$/.exec(path);
  const first = match?.[1];
  const rest =
    first && translatedSegments.includes(first) ? (match?.[2] ?? "") : path;
  return rest === "/docs" || rest.startsWith("/docs/");
}

/**
 * Where the docs zone publishes what the main app lists about the docs: the
 * sitemap's docs entries and the docs sections llms.txt links. /zone/ holds
 * the documents QRdx's deployments read from each other (the main app
 * publishes /zone/availability.json).
 */
export const DOCS_MANIFEST_PATH = "/zone/docs-manifest.json";

/** One sitemap entry, as Next's MetadataRoute.Sitemap takes it (dates as ISO strings). */
export interface DocsManifestEntry {
  url: string;
  lastModified?: string;
  changeFrequency?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
  alternates?: { languages?: Record<string, string> };
}

/** A docs page as llms.txt links it. */
export interface DocsManifestPage {
  title: string;
  url: string;
  description?: string;
}

/** A docs tab (Help, Guides, Developers, …) and its pages, in sidebar order. */
export interface DocsManifestSection {
  /** "" for pages outside every tab, like /docs itself. */
  title: string;
  pages: DocsManifestPage[];
}

export interface DocsManifest {
  version: 1;
  /** The docs' sitemap entries: each page that may be indexed, with hreflang. */
  sitemap: DocsManifestEntry[];
  /** The docs pages in sidebar order, grouped by tab. */
  sections: DocsManifestSection[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * `value` as a DocsManifest, or an error naming what's wrong. The main app
 * reads it over the network, so it checks the shape before using it.
 */
export function parseDocsManifest(value: unknown): DocsManifest {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("Docs manifest: not a version 1 manifest");
  }
  const { sitemap, sections } = value;
  if (
    !(
      Array.isArray(sitemap) &&
      sitemap.every((entry) => isRecord(entry) && typeof entry.url === "string")
    )
  ) {
    throw new Error("Docs manifest: `sitemap` must be a list of entries");
  }
  if (
    !(
      Array.isArray(sections) &&
      sections.every(
        (section) =>
          isRecord(section) &&
          typeof section.title === "string" &&
          Array.isArray(section.pages) &&
          section.pages.every(
            (page) =>
              isRecord(page) &&
              typeof page.title === "string" &&
              typeof page.url === "string"
          )
      )
    )
  ) {
    throw new Error("Docs manifest: `sections` must be a list of sections");
  }
  return value as unknown as DocsManifest;
}
