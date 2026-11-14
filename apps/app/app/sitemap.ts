import { isLocalizedPath } from "@repo/i18n/paths";
import { getCatalogBySurface } from "@repo/integrations/src/catalog";
import type { MetadataRoute } from "next";
import { BARCODE_FORMAT_PAGES } from "@/app/[lang]/(home)/barcode-generator/[format]/content";
import { CHAT_BOTS } from "@/components/sections/chat-bots/bots";
import { isArtAvailable } from "@/lib/ai/art-availability";
import { SLUG_TO_CATEGORY } from "@/lib/blog-constants";
import {
  blogAuthorsSource,
  blogSource,
  changelogSource,
  compareSource,
  customersSource,
  legalSource,
} from "@/lib/content-source";
import { CUSTOMERS_PATH } from "@/lib/customers";
import { docsZoneManifest } from "@/lib/docs-zone-manifest";
import { isPathAvailable } from "@/lib/feature-availability";
import { localizedEntries } from "@/lib/i18n/sitemap";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { filterVisible } from "@/lib/integration-availability-rules";
import { baseUrl } from "@/lib/metadata";
import { QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import {
  HOSTED_TYPE_SLUGS,
  hostedTypePath,
} from "@/lib/qr-types-content-hosted";
import { industries, placements } from "@/lib/seo-content";
import {
  contentLastModified,
  fileLastModified,
  latestDate as latest,
} from "@/lib/seo-dates";
import {
  HOSTED_TYPES_SOURCE,
  INTEGRATION_SOURCES,
  integrationSource,
  PAGE_SOURCES,
  QR_TYPES_SOURCE,
  seoGroupSource,
} from "@/lib/seo-page-sources";

export const revalidate = false;

type Entry = MetadataRoute.Sitemap[number];

// lastmod is a real date or absent, never the build time (lib/seo-dates.ts).
/**
 * Every translated page (packages/i18n/localized-paths.json) as its languages:
 * one entry per indexable language, with hreflang alternates (lib/i18n/
 * sitemap.ts). Languages a native reviewer hasn't signed off stay out.
 */
function withTranslations(entries: Entry[]): Entry[] {
  return entries.flatMap((entry) => {
    const path = new URL(entry.url).pathname;
    if (entry.alternates || !isLocalizedPath(path)) return [entry];
    const { url: _url, ...rest } = entry;
    return localizedEntries(path, rest);
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return withTranslations(entries(await docsEntries()));
}

/**
 * The docs' entries, from the docs site's manifest when DOCS_ZONE_URL is set
 * (that fetch makes this sitemap regenerate hourly; lib/docs-zone-manifest.ts).
 * The docs site decides them: the pages this deployment offers, and the
 * translations a native reviewer signed off. Without a docs site there are
 * none: the docs URLs redirect to qrdx.dev, whose sitemap lists them.
 */
async function docsEntries(): Promise<Entry[]> {
  const manifest = await docsZoneManifest();
  return manifest?.sitemap ?? [];
}

function entries(docs: Entry[]): Entry[] {
  const url = (path: string): string => new URL(path, baseUrl).toString();

  // TypeScript-written pages: the last change to the file that holds the
  // copy (git, or the recorded date when the build's clone is shallow).
  const collections = [industries, placements];
  const groupFiles = collections.flatMap((collection) =>
    collection.groups.map((group) => seoGroupSource(collection, group.id)),
  );
  const fileDates = fileLastModified([
    QR_TYPES_SOURCE,
    HOSTED_TYPES_SOURCE,
    ...groupFiles,
    ...Object.values(PAGE_SOURCES).flat(),
    ...INTEGRATION_SOURCES,
  ]);
  const pageDate = (path: string) =>
    latest((PAGE_SOURCES[path] ?? []).map((file) => fileDates.get(file)));
  const typesDate = fileDates.get(QR_TYPES_SOURCE);
  const topicDate = (
    collection: (typeof collections)[number],
    slug: string,
  ): Date | undefined => {
    const group = collection.groupOf(slug);
    return group
      ? fileDates.get(seoGroupSource(collection, group.id))
      : undefined;
  };

  const posts = blogSource.getPages().filter((p) => p.data.published);
  // A post's `updated` is its last substantive change; small fixes don't
  // count, so its git date isn't used.
  const postDate = (p: (typeof posts)[number]) =>
    latest([p.data.updated, p.data.date]);
  // Published customers' stories only (lib/content-source.ts).
  const stories = customersSource.getPages();
  const storyDate = (p: (typeof stories)[number]) =>
    latest([p.data.updated, p.data.date]);
  const compares = compareSource.getPages();
  // `lastVerified` is when the competitor facts were last checked.
  const compareDate = (p: (typeof compares)[number]) =>
    latest([
      p.data.lastVerified,
      contentLastModified(`content/compare/${p.path}`, p.data.lastModified),
    ]);

  // Third-party integrations only, and none that need setup here: AI
  // assistants, developer tools and plugins redirect to their own pages.
  const integrations = filterVisible(
    getIntegrationAvailability(),
    getCatalogBySurface("integrations"),
    (integration) => integration.slug,
  ).map((integration) => {
    const file = integrationSource(integration.slug);
    return {
      slug: integration.slug,
      lastModified: file ? fileDates.get(file) : undefined,
    };
  });

  const categories = Object.entries(SLUG_TO_CATEGORY).flatMap(
    ([slug, name]) => {
      const inCategory = posts.filter((p) => p.data.category === name);
      // Mirrors MIN_POSTS_TO_INDEX in blog/category/[slug]: thinner categories are noindex.
      if (inCategory.length < 2) return [];
      return {
        url: url(`/blog/category/${slug}`),
        lastModified: latest(inCategory.map(postDate)),
        changeFrequency: "weekly",
        priority: 0.6,
      } satisfies Entry;
    },
  );

  const authors = blogAuthorsSource.getPages().flatMap((author) => {
    const slug = author.slugs[0] ?? "";
    const authored = posts.filter((p) => p.data.author.includes(slug));
    if (authored.length === 0) return [];
    return {
      url: url(author.url),
      lastModified: latest(authored.map(postDate)),
      changeFrequency: "monthly",
      priority: 0.4,
    } satisfies Entry;
  });

  return [
    // Translated pages: one entry per indexable language, each listing the
    // others as alternates (lib/i18n/sitemap.ts).
    ...localizedEntries("/", {
      changeFrequency: "monthly",
      priority: 1,
    }),
    {
      url: url("/playground"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...localizedEntries("/pricing", {
      lastModified: pageDate("/pricing"),
      changeFrequency: "monthly",
      priority: 0.9,
    }),
    {
      url: url("/guarantee"),
      lastModified: pageDate("/guarantee"),
      changeFrequency: "yearly",
      priority: 0.6,
    },
    ...localizedEntries("/enterprise", {
      lastModified: pageDate("/enterprise"),
      changeFrequency: "monthly",
      priority: 0.7,
    }),
    ...localizedEntries("/security", {
      lastModified: pageDate("/security"),
      changeFrequency: "monthly",
      priority: 0.6,
    }),
    ...(isPathAvailable("/affiliates")
      ? [
          {
            url: url("/affiliates"),
            lastModified: pageDate("/affiliates"),
            changeFrequency: "monthly",
            priority: 0.5,
          } satisfies Entry,
        ]
      : []),
    // AI themes and AI QR art are only listed where they can run
    // (packages/availability/rules.ts).
    ...(isPathAvailable("/ai")
      ? [
          {
            url: url("/ai"),
            changeFrequency: "weekly",
            priority: 0.9,
          } satisfies Entry,
        ]
      : []),
    ...(isArtAvailable
      ? [
          {
            url: url("/ai/art"),
            changeFrequency: "monthly",
            priority: 0.8,
          } satisfies Entry,
        ]
      : []),
    {
      url: url("/community"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: url("/templates"),
      lastModified: pageDate("/templates"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: url("/integrations"),
      lastModified: latest(integrations.map((i) => i.lastModified)),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...integrations.map(
      (integration) =>
        ({
          url: url(`/integrations/${integration.slug}`),
          lastModified: integration.lastModified,
          changeFrequency: "monthly",
          priority: 0.6,
        }) satisfies Entry,
    ),
    {
      url: url("/mcp"),
      lastModified: pageDate("/mcp"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: url("/qr-code-api"),
      lastModified: pageDate("/qr-code-api"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: url("/dynamic-qr-code"),
      lastModified: pageDate("/dynamic-qr-code"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: url("/open-source-qr-code-generator"),
      lastModified: pageDate("/open-source-qr-code-generator"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: url("/plugins"),
      lastModified: pageDate("/plugins"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    // The chat bots' pages, where each bot is set up
    // (packages/availability/rules.ts).
    ...CHAT_BOTS.filter((bot) => isPathAvailable(bot.path)).map(
      (bot) =>
        ({
          url: url(bot.path),
          lastModified: pageDate(bot.path),
          changeFrequency: "monthly",
          priority: 0.7,
        }) satisfies Entry,
    ),
    {
      url: url("/changelogs"),
      lastModified: latest(changelogSource.getPages().map((p) => p.data.date)),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    // The docs (docsEntries).
    ...docs,
    {
      url: url("/blog"),
      lastModified: latest(posts.map(postDate)),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...categories,
    ...authors,
    ...posts.map(
      (page) =>
        ({
          url: url(page.url),
          lastModified: postDate(page),
          changeFrequency: "monthly",
          priority: 0.7,
        }) satisfies Entry,
    ),
    {
      url: url(CUSTOMERS_PATH),
      lastModified: latest(stories.map(storyDate)),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...stories.map(
      (page) =>
        ({
          url: url(page.url),
          lastModified: storyDate(page),
          changeFrequency: "monthly",
          priority: 0.7,
        }) satisfies Entry,
    ),
    {
      url: url("/qr-code-generator"),
      lastModified: typesDate,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...QR_TYPE_SLUGS.map(
      (type) =>
        ({
          url: url(`/qr-code-generator/${type}`),
          lastModified: typesDate,
          changeFrequency: "monthly",
          priority: 0.7,
        }) satisfies Entry,
    ),
    // Codes that open a hosted page; the PDF one needs file storage.
    ...HOSTED_TYPE_SLUGS.filter((slug) =>
      isPathAvailable(hostedTypePath(slug)),
    ).map(
      (slug) =>
        ({
          url: url(hostedTypePath(slug)),
          lastModified: fileDates.get(HOSTED_TYPES_SOURCE),
          changeFrequency: "monthly",
          priority: 0.7,
        }) satisfies Entry,
    ),
    ...collections.flatMap((collection) => [
      {
        url: url(collection.basePath),
        lastModified: latest(
          collection.items.map((topic) => topicDate(collection, topic.slug)),
        ),
        changeFrequency: "monthly",
        priority: 0.7,
      } satisfies Entry,
      ...collection.items.map(
        (topic) =>
          ({
            url: url(collection.path(topic.slug)),
            lastModified: topicDate(collection, topic.slug),
            changeFrequency: "monthly",
            priority: 0.6,
          }) satisfies Entry,
      ),
    ]),
    {
      url: url("/tools"),
      lastModified: pageDate("/tools"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: url("/tools/bulk"),
      lastModified: pageDate("/tools/bulk"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: url("/tools/print-size"),
      lastModified: pageDate("/tools/print-size"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: url("/tools/scan-checker"),
      lastModified: pageDate("/tools/scan-checker"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: url("/barcode-generator"),
      lastModified: pageDate("/barcode-generator"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...BARCODE_FORMAT_PAGES.map(
      (page) =>
        ({
          url: url(`/barcode-generator/${page.slug}`),
          lastModified: pageDate("/barcode-generator/[format]"),
          changeFrequency: "monthly",
          priority: 0.6,
        }) satisfies Entry,
    ),
    {
      url: url("/scan"),
      lastModified: pageDate("/scan"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: url("/compare"),
      lastModified: latest(compares.map(compareDate)),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...compares.map(
      (page) =>
        ({
          url: url(page.url),
          lastModified: compareDate(page),
          changeFrequency: "monthly",
          priority: 0.6,
        }) satisfies Entry,
    ),
    // The affiliate terms only where the program runs.
    ...legalSource
      .getPages()
      .filter((page) => isPathAvailable(page.url))
      .map(
        (page) =>
          ({
            url: url(page.url),
            lastModified: contentLastModified(
              `content/legal/${page.path}`,
              page.data.lastModified,
            ),
            changeFrequency: "yearly",
            priority: 0.3,
          }) satisfies Entry,
      ),
    {
      url: url("/report-abuse"),
      lastModified: pageDate("/report-abuse"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
