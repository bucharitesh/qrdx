// The docs zone: the docs are a separate Next.js app (apps/docs),
// served at the same URLs on qrdx.dev. The routing between the zones
// (docsZoneRewrites, isDocsPagePath) lives with the docs' other URL rules in
// @repo/i18n/docs; this is the manifest the docs zone publishes for the main
// app. Pure: next.config.ts, route handlers and tests import it.

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
