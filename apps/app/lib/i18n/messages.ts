// Message catalogs (apps/app/messages). English is the source; a key a
// translation lacks falls back to English, so a slip never shows a raw key.
// The helpers (mergeMessages, pickMessages, CHROME_NAMESPACES) live in
// @repo/i18n/messages, with the copy of the docs' namespaces another app
// reads; this app loads its full catalogs here.

import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/config";
import { mergeMessages } from "@repo/i18n/messages";
import en from "@/messages/en.json";

export type Messages = typeof en;

/**
 * A locale's catalog over English. Found by path, so a new language needs
 * no code here; a missing file renders English (i18n:check reports it).
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === DEFAULT_LOCALE) return en;
  try {
    const catalog: unknown = (await import(`../../messages/${locale}.json`))
      .default;
    return mergeMessages(en, catalog);
  } catch {
    return en;
  }
}
