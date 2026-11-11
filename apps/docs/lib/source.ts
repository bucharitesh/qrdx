import {
  type InferMetaType,
  type InferPageType,
  loader,
} from "fumadocs-core/source";
import { openapiPlugin } from "fumadocs-openapi/server";
import {
  blog,
  blogAuthors,
  blogCategories,
  changelog,
  compare,
  docs,
  legal,
} from "@/.source/server";
import { resolveDocsIcon } from "@/lib/docs-icons";
import type { Locale } from "@/lib/i18n/config";
import {
  DOCS_LOCALES,
  docsI18n,
  docsUrl,
  translationLocale,
} from "@/lib/i18n/docs";
import { withEnglishStructure } from "@/lib/i18n/docs-meta";

const docsFiles = docs.toFumadocsSource();

/**
 * The English docs. Translations (page.es.mdx, meta.ja.json) live beside
 * the English files and are left out here; `localizedSource` reads them.
 * The sitemap, llms.txt, the .md routes and Open Graph images use this one.
 */
export const source = loader({
  baseUrl: "/docs",
  source: {
    files: docsFiles.files.filter((file) => !translationLocale(file.path)),
  },
  icon: resolveDocsIcon,
  // Method badges on the API reference pages in the sidebar.
  plugins: [openapiPlugin()],
});

/**
 * The docs in every language with docs (lib/i18n/docs.ts): English plus
 * each translation, at /docs/..., /es/docs/..., /zh-hans/docs/....
 * A page that isn't translated is the English page at the language's URL
 * (`isTranslatedPage` tells them apart).
 */
export const localizedSource = loader({
  baseUrl: "/docs",
  // Sidebar structure from the English meta.json, labels from the
  // translations (lib/i18n/docs-meta.ts): new English pages appear at once.
  source: { files: withEnglishStructure(docsFiles.files) },
  i18n: docsI18n,
  url: (slugs, locale) => docsUrl(slugs, (locale ?? "en") as Locale),
  icon: resolveDocsIcon,
  plugins: [openapiPlugin()],
});

export type LocalizedPage = InferPageType<typeof localizedSource>;

/** Whether a page is a translation, not the English page shown as a fallback. */
export function isTranslatedPage(page: LocalizedPage): boolean {
  return translationLocale(page.path) !== undefined;
}

/** The languages a docs page is translated into, English first. */
export function docsPageLocales(slugs: string[]): Locale[] {
  return DOCS_LOCALES.filter((locale) => {
    const page = localizedSource.getPage(slugs, locale);
    return page !== undefined && (locale === "en" || isTranslatedPage(page));
  });
}

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

/** A legal page's Open Graph image, served by app/og/legal/[...slug]. */
export function getLegalPageImage(page: InferPageType<typeof legalSource>) {
  const segments = [...page.slugs, "image.png"];

  return {
    segments,
    url: `/og/legal/${segments.join("/")}`,
  };
}

export type Page = InferPageType<typeof source>;
export type Meta = InferMetaType<typeof source>;
