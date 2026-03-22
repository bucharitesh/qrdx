import {
  type InferMetaType,
  type InferPageType,
  loader,
} from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { blog, changelog, compare, docs, legal } from "@/.source/server";

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
  baseUrl: "/changelog",
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

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: `/og/docs/${segments.join("/")}`,
  };
}

export type Page = InferPageType<typeof source>;
export type Meta = InferMetaType<typeof source>;
