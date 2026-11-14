import {
  type InferMetaType,
  type InferPageType,
  loader,
} from "fumadocs-core/source";
import { openapiPlugin } from "fumadocs-openapi/server";
import { docs } from "@/.source/docs";
import {
  docsLoaderOptions,
  localizedDocsLoaderOptions,
  pageLocales,
} from "@/lib/docs-common";
import { resolveDocsIcon } from "@/lib/docs-icons";
import { translationLocale } from "@/lib/i18n/docs";
import { withEnglishStructure } from "@/lib/i18n/docs-meta";

// The compiled docs, for the docs pages (app/[lang]/docs) only. Everything
// else reads the docs from lib/docs-index.ts, and the other content (blog,
// changelog, legal, comparisons) from lib/content-source.ts: a route handler
// that imports this file compiles every docs page a second time.

export { getPageImage, isTranslatedPage } from "@/lib/docs-common";

const docsFiles = docs.toFumadocsSource();

/**
 * The English docs. Translations (page.es.mdx, meta.ja.json) live beside
 * the English files and are left out here; `localizedSource` reads them.
 */
export const source = loader({
  ...docsLoaderOptions,
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
  ...localizedDocsLoaderOptions,
  // Sidebar structure from the English meta.json, labels from the
  // translations (lib/i18n/docs-meta.ts): new English pages appear at once.
  source: { files: withEnglishStructure(docsFiles.files) },
  icon: resolveDocsIcon,
  plugins: [openapiPlugin()],
});

export type LocalizedPage = InferPageType<typeof localizedSource>;

/** The languages a docs page is translated into, English first. */
export function docsPageLocales(slugs: string[]) {
  return pageLocales(localizedSource, slugs);
}

export type Page = InferPageType<typeof source>;
export type Meta = InferMetaType<typeof source>;
