import {
  type InferMetaType,
  type InferPageType,
  loader,
} from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import {
  blog,
  blogAuthors,
  blogCategories,
  changelog,
  compare,
  docs,
  legal,
} from "@/.source/server";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

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

export const blogCategoriesSource = loader({
  baseUrl: "/blog/category",
  source: blogCategories.toFumadocsSource(),
});

export const blogAuthorsSource = loader({
  baseUrl: "/blog/authors",
  source: blogAuthors.toFumadocsSource(),
});

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: `/og/docs/${segments.join("/")}`,
  };
}

export type Page = InferPageType<typeof source>;
export type Meta = InferMetaType<typeof source>;
