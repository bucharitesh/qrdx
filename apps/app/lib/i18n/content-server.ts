import "server-only";

import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/config";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { sourceHash } from "./catalog";
import {
  type ContentRules,
  contentStrings,
  overlayContent,
  type TranslationMemory,
} from "./content";

/**
 * A locale's translation memory for TypeScript copy (lib/i18n/content.ts),
 * loaded once per request (the promise is stable for `use`).
 */
export const loadMemory = cache(
  async (locale: Locale): Promise<TranslationMemory> => {
    if (locale === DEFAULT_LOCALE) return {};
    try {
      return (await import(`../../messages/content/${locale}.json`))
        .default as TranslationMemory;
    } catch {
      return {};
    }
  },
);

/**
 * `data` (English, from a TypeScript module) in `locale`: each string with
 * a current translation is replaced, the rest stays English. Only data
 * listed in lib/i18n/content-sources.ts gets translated.
 */
export async function localizeContent<T>(
  data: T,
  locale: Locale,
  rules?: ContentRules,
): Promise<T> {
  if (locale === DEFAULT_LOCALE) return data;
  const memory = await loadMemory(locale);
  return overlayContent(data, (english) => lookup(memory, english), rules);
}

/** The current translation of `english`, if the memory has one. */
function lookup(
  memory: TranslationMemory,
  english: string,
): string | undefined {
  const entry = memory[sourceHash(english)];
  return entry && entry.source === english && entry.text.trim()
    ? entry.text
    : undefined;
}

/**
 * English → translation for every string in `data` the memory has, for
 * client components (components/i18n/content-text.tsx). Only these strings
 * reach the browser, not the whole memory.
 */
export function pickTranslations(
  memory: TranslationMemory,
  data: unknown,
  rules?: ContentRules,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const english of contentStrings("", data, rules).keys()) {
    const text = lookup(memory, english);
    if (text) out[english] = text;
  }
  return out;
}

/** localizeContent() in the current request's language (English under app/(app)). */
export async function localized<T>(data: T, rules?: ContentRules): Promise<T> {
  return localizeContent(data, await getLocale(), rules);
}
