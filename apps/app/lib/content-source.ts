import { type InferPageType, loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import {
  blog,
  blogAuthors,
  blogCategories,
  changelog,
  compare,
  customers,
  legal,
} from "@/.source/content";
import { isPublishedCustomerStory } from "@/lib/customers";

// The content other than the docs: legal pages, the changelog, comparisons,
// the blog and customer stories. Route handlers (Open Graph images, RSS, the
// sitemap, llms.txt) import these from here, never from lib/source.ts, which
// also holds the compiled docs (see lib/docs-index.ts).

export const legalSource = loader({
  baseUrl: "/legal",
  source: legal.toFumadocsSource(),
});

export const changelogSource = loader({
  baseUrl: "/changelogs",
  source: changelog.toFumadocsSource(),
});

export const compareSource = loader({
  baseUrl: "/compare",
  source: compare.toFumadocsSource(),
});

export const blogSource = loader({
  baseUrl: "/blog",
  source: blog.toFumadocsSource(),
});

// Only the stories of customers published in lib/customers.ts: every
// /customers page, the sitemap, llms.txt and the Open Graph images read this
// source, so an unpublished story is as if it weren't there (no page, no
// static params).
export const customersSource = loader({
  baseUrl: "/customers",
  source: toFumadocsSource(
    customers.docs.filter((story) => isPublishedCustomerStory(story.info.path)),
    customers.meta,
  ),
});

export const blogCategoriesSource = loader({
  baseUrl: "/blog/category",
  source: blogCategories.toFumadocsSource(),
});

export const blogAuthorsSource = loader({
  baseUrl: "/blog/authors",
  source: blogAuthors.toFumadocsSource(),
});

/** A legal page's Open Graph image, served by app/og/legal/[...slug]. */
export function getLegalPageImage(page: InferPageType<typeof legalSource>) {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: `/og/legal/${segments.join("/")}`,
  };
}
