import "server-only";

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { StructuredData } from "fumadocs-core/mdx-plugins";
import {
  loader,
  type MetaData,
  type StaticSource,
  type VirtualFile,
} from "fumadocs-core/source";
import {
  docsLoaderOptions,
  localizedDocsLoaderOptions,
  pageLocales,
} from "@/lib/docs-common";
import { translationLocale } from "@/lib/i18n/docs";
import { withEnglishStructure } from "@/lib/i18n/docs-meta";
import type { Page as CompiledPage } from "@/lib/source";

// The docs for route handlers: the .md and llms routes, search, the sitemap
// and Open Graph images. They read each page's frontmatter, date, search
// data and Markdown from .source/docs-index (lib/docs-index-plugin.ts,
// written when the build starts) instead of the compiled MDX in lib/source.ts, so the
// build compiles the docs once, for the pages, and not a second time for
// the routes. Same pages, URLs and sidebar order as lib/source.ts.
//
// Keep it that way: a route handler that imports lib/source.ts (or anything
// that does) brings every compiled docs page back into the routes' build.

export { getPageImage, isTranslatedPage } from "@/lib/docs-common";

/** A page's data here: the compiled page's, without the MDX. */
export type DocsIndexPageData = Omit<
  CompiledPage["data"],
  "body" | "toc" | "structuredData" | "_exports" | "getMDAST"
> & {
  /** Its search data (read on first use; fumadocs search accepts a loader). */
  structuredData: () => Promise<StructuredData>;
};

/** A meta.json's data here, as fumadocs-mdx's server runtime gives it. */
export type DocsIndexMetaData = MetaData & {
  info: { path: string; fullPath: string };
  [key: string]: unknown;
};

interface IndexConfig {
  pageData: DocsIndexPageData;
  metaData: DocsIndexMetaData;
}

type IndexVirtualFile = VirtualFile<IndexConfig>;

interface IndexedFile {
  type: "page" | "meta";
  path: string;
  absolutePath: string;
  data: Record<string, unknown>;
}

/**
 * A file in .source/docs-index: read once in production, and again in
 * `next dev` when the plugin has rewritten it. Literal paths, so the
 * build's file tracing ships the files with the routes that read them.
 */
function jsonFile<T>(file: string): () => T {
  let cached: { mtimeMs: number; value: T } | undefined;
  return () => {
    if (cached && process.env.NODE_ENV !== "development") return cached.value;
    const { mtimeMs } = statSync(file);
    if (cached?.mtimeMs !== mtimeMs) {
      cached = { mtimeMs, value: JSON.parse(readFileSync(file, "utf8")) };
    }
    return cached.value;
  };
}

const pagesFile = jsonFile<{ files: IndexedFile[] }>(
  join(process.cwd(), ".source/docs-index/pages.json"),
);
const searchFile = jsonFile<Record<string, StructuredData>>(
  join(process.cwd(), ".source/docs-index/search.json"),
);
const markdownFile = jsonFile<Record<string, string>>(
  join(process.cwd(), ".source/docs-index/markdown.json"),
);

/** An indexed file as fumadocs-mdx's server runtime shapes it. */
function toVirtualFile(file: IndexedFile): IndexVirtualFile {
  const info = { path: file.path, fullPath: file.absolutePath };
  if (file.type === "meta") {
    return {
      type: "meta",
      path: file.path,
      absolutePath: file.absolutePath,
      data: { info, ...file.data } as DocsIndexMetaData,
    };
  }
  const { lastModified, ...frontmatter } = file.data;
  const data = {
    ...(frontmatter as Omit<DocsIndexPageData, "info" | "lastModified">),
    info,
    lastModified:
      typeof lastModified === "string" ? new Date(lastModified) : undefined,
    structuredData: async () => {
      const found = searchFile()[file.path];
      if (!found) throw new Error(`No search data for ${file.path}`);
      return found;
    },
    // The processed Markdown only: reading the MDX file itself would ship
    // content/docs with every route that imports this.
    async getText(type: "raw" | "processed") {
      if (type === "raw") throw new Error("The docs index has no raw MDX");
      const found = markdownFile()[file.path];
      if (found === undefined) throw new Error(`No Markdown for ${file.path}`);
      return found;
    },
  };
  return {
    type: "page",
    path: file.path,
    absolutePath: file.absolutePath,
    data,
  };
}

function createSources(files: IndexedFile[]) {
  const all = files.map(toVirtualFile);
  const english: StaticSource<IndexConfig> = {
    files: all.filter((file) => !translationLocale(file.path)),
  };
  const localized: StaticSource<IndexConfig> = {
    files: withEnglishStructure(all),
  };
  return {
    english: loader({ ...docsLoaderOptions, source: english }),
    localized: loader({ ...localizedDocsLoaderOptions, source: localized }),
  };
}

let sources: { files: IndexedFile[]; value: ReturnType<typeof createSources> };

function current() {
  const { files } = pagesFile();
  if (sources?.files !== files)
    sources = { files, value: createSources(files) };
  return sources.value;
}

/** The English docs (lib/source.ts `source`). */
export function docsIndex() {
  return current().english;
}

/** The docs in every language with docs (lib/source.ts `localizedSource`). */
export function localizedDocsIndex() {
  return current().localized;
}

export type DocsIndexPage = ReturnType<
  ReturnType<typeof docsIndex>["getPages"]
>[number];

/** The languages a docs page is translated into, English first. */
export function docsPageLocales(slugs: string[]) {
  return pageLocales(localizedDocsIndex(), slugs);
}
