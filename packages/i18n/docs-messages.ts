// The docs' catalogs, for an app that can't import the main app's
// (messages.ts says how the copy in messages/<locale>.json is kept up to
// date). English is the source; a key a translation lacks falls back to
// English, so a slip never shows a raw key.
import { DEFAULT_LOCALE, type Locale } from "./config";
import { mergeMessages } from "./messages";
import en from "./messages/en.json";

/** The docs' English catalog: DOCS_NAMESPACES of apps/docs/messages/en.json. */
export type DocsMessages = typeof en;

/**
 * A locale's docs catalog over English. Found by path, so a new language
 * needs no code here; a missing file renders English.
 */
export async function loadDocsMessages(locale: Locale): Promise<DocsMessages> {
  if (locale === DEFAULT_LOCALE) return en;
  try {
    const catalog: unknown = (await import(`./messages/${locale}.json`))
      .default;
    return mergeMessages(en, catalog);
  } catch {
    return en;
  }
}
