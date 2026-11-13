import { type InferPageType, loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import {
  blog,
  blogAuthors,
  blogCategories,
  changelog,
  compare,
  legal,
} from "@/.source/content";
import { isHiddenCustomerStory } from "@/lib/customers";

// The content other than the docs: legal pages, the changelog, comparisons
// and the blog. Route handlers (Open Graph images, RSS, the sitemap, llms.txt)
// import these from here, never from lib/source.ts, which also holds the
// compiled docs (see lib/docs-index.ts). Pages can use either: lib/source.ts
// re-exports them.

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

// A customer story stays out of the blog until its customer is published in
// lib/customers.ts: every blog page, list, feed and sitemap reads this source,
// so it's as if the post weren't there (no page, no static params).
export const blogSource = loader({
  baseUrl: "/blog",
  source: toFumadocsSource(
    blog.docs.filter((post) => !isHiddenCustomerStory(post.info.path)),
    blog.meta,
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
