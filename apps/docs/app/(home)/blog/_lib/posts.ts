import type { InferPageType } from "fumadocs-core/source";
import type { Metadata } from "next";
import { resolveAuthors } from "@/lib/blog-authors";
import { SLUG_TO_CATEGORY } from "@/lib/blog-constants";
import { baseUrl } from "@/lib/metadata";
import { blogSource } from "@/lib/source";

export type BlogPage = InferPageType<typeof blogSource>;

const WORDS_PER_MINUTE = 220;

export const BLOG_RSS_PATH = "/blog/rss.xml";

export function absoluteUrl(path: string): string {
  return new URL(path, baseUrl).toString();
}

export const rssAlternateTypes: NonNullable<Metadata["alternates"]>["types"] = {
  "application/rss+xml": [
    { url: absoluteUrl(BLOG_RSS_PATH), title: "QRdx Blog" },
  ],
};

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function toTime(date: string): number {
  return new Date(date).getTime();
}

/** Published posts, newest first. */
export function getPublishedPosts(): BlogPage[] {
  return blogSource
    .getPages()
    .filter((page) => page.data.published)
    .sort((a, b) => toTime(b.data.date) - toTime(a.data.date));
}

export function getPostSlug(page: BlogPage): string {
  return page.slugs[0] ?? "";
}

export function getReadingTime(page: BlogPage): number {
  const { headings, contents } = page.data.structuredData;
  const words = [...headings, ...contents]
    .map((item) => item.content)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function getCategorySlug(category: string): string | undefined {
  return Object.entries(SLUG_TO_CATEGORY).find(
    ([, name]) => name === category,
  )?.[0];
}

export function toPostCard(page: BlogPage) {
  return {
    slug: getPostSlug(page),
    title: page.data.title,
    description: page.data.description ?? "",
    date: page.data.date,
    author: resolveAuthors(page.data.author),
    category: page.data.category,
    image: page.data.image,
    imageAlt: page.data.imageAlt,
  };
}

/** Explicit `related` posts first, then the same category, then the newest posts. */
export function getRelatedPosts(page: BlogPage, limit = 3): BlogPage[] {
  const slug = getPostSlug(page);
  const others = getPublishedPosts().filter((p) => getPostSlug(p) !== slug);
  const picked: BlogPage[] = [];

  const add = (candidate: BlogPage | undefined) => {
    if (candidate && picked.length < limit && !picked.includes(candidate)) {
      picked.push(candidate);
    }
  };

  for (const id of page.data.related ?? []) {
    add(others.find((p) => getPostSlug(p) === id));
  }
  for (const p of others) {
    if (p.data.category === page.data.category) add(p);
  }
  for (const p of others) add(p);

  return picked;
}
