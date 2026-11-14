import "server-only";

import type {
  DocsManifest,
  DocsManifestEntry,
} from "@repo/next-config/docs-zone";
import { docsSections } from "@/lib/agents/docs-pages";
import { docsIndex, docsPageLocales } from "@/lib/docs-index";
import { isPathAvailable } from "@/lib/feature-availability";
import { docsSitemapEntries } from "@/lib/i18n/docs-seo";
import { contentLastModified } from "@/lib/seo-dates";

/**
 * What the main app lists about the docs (DOCS_MANIFEST_PATH): the docs'
 * entries of qrdx.dev/sitemap.xml, as the main app's app/sitemap.ts builds
 * them for its own copy of the docs, and the sections llms.txt links.
 */
export function docsManifest(): DocsManifest {
  // Docs for features the main app can't offer (custom domains) are left
  // out; the pages stay up for existing users. Translations a native
  // reviewer signed off follow their English page (lib/i18n/docs-seo.ts).
  const sitemap = docsIndex()
    .getPages()
    .filter((page) => isPathAvailable(page.url))
    .flatMap((page) =>
      docsSitemapEntries(page.slugs, docsPageLocales(page.slugs), {
        lastModified: contentLastModified(
          `content/docs/${page.path}`,
          page.data.lastModified,
        ),
        changeFrequency: "weekly",
        priority: page.url === "/docs" ? 0.8 : 0.5,
      }),
    )
    .map(
      ({ lastModified, ...entry }): DocsManifestEntry => ({
        ...(entry as Omit<DocsManifestEntry, "lastModified">),
        ...(lastModified && {
          lastModified: new Date(lastModified).toISOString(),
        }),
      }),
    );

  const sections = docsSections().map((section) => ({
    title: section.title,
    pages: section.pages.map((page) => ({
      title: page.data.title,
      url: page.url,
      ...(page.data.description && { description: page.data.description }),
    })),
  }));

  return { version: 1, sitemap, sections };
}
