// The docs sidebar in other languages: a translated meta.<locale>.json gives
// the labels (folder title and description, separators, link names); the
// structure (which pages, in which order, which tab) always comes from the
// English meta.json. A page added to the English sidebar therefore shows up
// in every language at once, in English with the "not translated yet" note,
// before anyone runs `bun run --filter docs i18n:docs`.
//
// Labels are matched to the English entries by the page next to them (a
// separator by the page after it, or else the one before it; a link by its
// URL), so pages inserted elsewhere don't shift them. A label that matches
// nothing (a new separator) stays English until the folder is translated
// again. Client-safe and pure; lib/source.ts and the tests use it.
import { englishFile, translationLocale } from "./docs";

const SEPARATOR = /^---(?:\[[^\]]+])?(.+)---$/;
const LINK = /^(?:external:)?(?:\[[^\]]+])?\[([^\]]+)]\(([^)]+)\)$/;

const isLabel = (entry: string) => SEPARATOR.test(entry) || LINK.test(entry);

/** Where a label sits: its URL (links), or the pages around it (separators). */
function labelKeys(pages: readonly string[], index: number): string[] {
  const link = LINK.exec(pages[index] as string);
  if (link) return [`link ${link[2]}`];
  const next = pages.slice(index + 1).find((entry) => !isLabel(entry));
  const previous = pages
    .slice(0, index)
    .reverse()
    .find((entry) => !isLabel(entry));
  return [`before ${next ?? "(end)"}`, `after ${previous ?? "(start)"}`];
}

/**
 * The English `pages`, with each label in its translation where one
 * matches. First by the page after a separator (or a link's URL), then by
 * the page before it; each translated label is used once, so a new English
 * separator never takes a neighbour's label.
 */
export function localizedPages(
  english: readonly string[],
  translated: readonly string[] | undefined,
): string[] {
  if (!translated) return [...english];
  const out = [...english];
  /** Translated labels taken, and English labels given one. */
  const used = new Set<number>();
  const done = new Set<number>();
  for (const pass of [0, 1]) {
    const labels = new Map<string, number>();
    translated.forEach((entry, index) => {
      if (!isLabel(entry) || used.has(index)) return;
      const key = labelKeys(translated, index)[pass];
      if (key !== undefined && !labels.has(key)) labels.set(key, index);
    });
    english.forEach((entry, index) => {
      if (!isLabel(entry) || done.has(index)) return;
      const key = labelKeys(english, index)[pass];
      const match = key === undefined ? undefined : labels.get(key);
      if (match === undefined || used.has(match)) return;
      used.add(match);
      done.add(index);
      out[index] = translated[match] as string;
    });
  }
  return out;
}

interface MetaData {
  title?: string;
  description?: string;
  pages?: string[];
  [key: string]: unknown;
}

/** A translated meta file's data: English structure, translated labels. */
export function localizedMeta<T extends MetaData>(
  english: T,
  translated: T,
): T {
  return {
    ...english,
    // fumadocs-mdx's file info (path) stays the translation's own.
    ...("info" in translated && { info: translated.info }),
    ...(translated.title && { title: translated.title }),
    ...(translated.description && { description: translated.description }),
    ...(english.pages && {
      pages: localizedPages(english.pages, translated.pages),
    }),
  };
}

interface ContentFile {
  type: string;
  path: string;
  data: unknown;
}

/**
 * The content files with every translated meta file rebuilt on its English
 * one (localizedMeta), for the docs loader in each language.
 */
export function withEnglishStructure<F extends ContentFile>(
  files: readonly F[],
): F[] {
  const english = new Map(
    files
      .filter((file) => file.type === "meta" && !translationLocale(file.path))
      .map((file) => [file.path, file]),
  );
  return files.map((file) => {
    if (file.type !== "meta" || !translationLocale(file.path)) return file;
    const source = english.get(englishFile(file.path));
    if (!source) return file;
    return {
      ...file,
      data: localizedMeta(source.data as MetaData, file.data as MetaData),
    };
  });
}
