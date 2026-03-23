import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/metadata";
import {
  blogSource,
  changelogSource,
  compareSource,
  legalSource,
  source,
} from "@/lib/source";

export const revalidate = false;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = (path: string): string => new URL(path, baseUrl).toString();

  return [
    {
      url: url("/"),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: url("/community"),
      changeFrequency: "monthly",
      priority: 0.9,
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
    {
      url: url("/integrations"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: url("/docs"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: url("/changelogs"),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...source.getPages().flatMap((page) => {
      const { lastModified } = page.data;

      return {
        url: url(page.url),
        lastModified: lastModified ? new Date(lastModified) : undefined,
        changeFrequency: "weekly",
        priority: 0.5,
      } as MetadataRoute.Sitemap[number];
    }),
    ...changelogSource.getPages().flatMap((page) => {
      const { date } = page.data;

      return {
        url: url(page.url),
        lastModified: date ? new Date(date) : undefined,
        changeFrequency: "monthly",
        priority: 0.5,
      } as MetadataRoute.Sitemap[number];
    }),
    ...legalSource.getPages().flatMap((page) => {
      const { lastModified } = page.data;

      return {
        url: url(page.url),
        lastModified: lastModified ? new Date(lastModified) : undefined,
        changeFrequency: "monthly",
        priority: 0.3,
      } as MetadataRoute.Sitemap[number];
    }),
    {
      url: url("/blog"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: url("/blog/category/company"),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: url("/blog/category/engineering"),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: url("/blog/category/education"),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...blogSource.getPages().flatMap((page) => {
      const { date } = page.data;

      return {
        url: url(page.url),
        lastModified: date ? new Date(date) : undefined,
        changeFrequency: "monthly",
        priority: 0.7,
      } as MetadataRoute.Sitemap[number];
    }),
    ...compareSource.getPages().flatMap((page) => {
      const { lastModified } = page.data;

      return {
        url: url(page.url),
        lastModified: lastModified ? new Date(lastModified) : undefined,
        changeFrequency: "monthly",
        priority: 0.6,
      } as MetadataRoute.Sitemap[number];
    }),
  ];
}
