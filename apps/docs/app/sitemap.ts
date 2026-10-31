import {
  getIntegrationRegistry,
  initializeIntegrations,
} from "@repo/integrations";
import type { MetadataRoute } from "next";
import { SLUG_TO_CATEGORY } from "@/lib/blog-constants";
import { env } from "@/lib/env";
import { baseUrl } from "@/lib/metadata";
import { QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import {
  blogAuthorsSource,
  blogSource,
  changelogSource,
  compareSource,
  legalSource,
  source,
} from "@/lib/source";

export const revalidate = false;

type Entry = MetadataRoute.Sitemap[number];

const latest = (dates: (Date | string | undefined)[]): Date | undefined => {
  const times = dates
    .filter((d): d is Date | string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  return times.length > 0 ? new Date(Math.max(...times)) : undefined;
};

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string): string => new URL(path, baseUrl).toString();

  initializeIntegrations();

  const posts = blogSource.getPages().filter((p) => p.data.published);
  const postDate = (p: (typeof posts)[number]) =>
    latest([p.data.updated, p.data.lastModified, p.data.date]);
  const compares = compareSource.getPages();

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
    {
      url: url("/"),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: url("/playground"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: url("/pricing"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: url("/ai"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    // AI QR art is only listed where it can run (same check as lib/ai/art.ts).
    ...(env.FAL_KEY
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
      url: url("/integrations"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...getIntegrationRegistry()
      .getAll()
      .map(
        (integration) =>
          ({
            url: url(`/integrations/${integration.slug}`),
            changeFrequency: "monthly",
            priority: 0.6,
          }) satisfies Entry,
      ),
    {
      url: url("/changelogs"),
      lastModified: latest(changelogSource.getPages().map((p) => p.data.date)),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    ...source.getPages().map(
      (page) =>
        ({
          url: url(page.url),
          lastModified: page.data.lastModified,
          changeFrequency: "weekly",
          priority: page.url === "/docs" ? 0.8 : 0.5,
        }) satisfies Entry,
    ),
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
      url: url("/qr-code-generator"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...QR_TYPE_SLUGS.map(
      (type) =>
        ({
          url: url(`/qr-code-generator/${type}`),
          changeFrequency: "monthly",
          priority: 0.7,
        }) satisfies Entry,
    ),
    {
      url: url("/tools"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: url("/tools/bulk"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: url("/tools/print-size"),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: url("/tools/scan-checker"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: url("/compare"),
      lastModified: latest(compares.map((p) => p.data.lastModified)),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...compares.map(
      (page) =>
        ({
          url: url(page.url),
          lastModified: page.data.lastModified,
          changeFrequency: "monthly",
          priority: 0.6,
        }) satisfies Entry,
    ),
    ...legalSource.getPages().map(
      (page) =>
        ({
          url: url(page.url),
          lastModified: page.data.lastModified,
          changeFrequency: "yearly",
          priority: 0.3,
        }) satisfies Entry,
    ),
  ];
}
