// QRdx's own words on the pages people reach by scanning a code: the /q
// status pages, the password form, "Share your location?" and the chrome
// of hosted pages (/p). Scanners never chose a language and these pages
// have no menu, so the language comes from the request's Accept-Language
// (./accept-language.ts), per request: nothing on these paths is cached
// for everyone. The catalog part is messages/<locale>.json → "scanPages".

import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/config";
import { mergeMessages } from "@repo/i18n/messages";
import { createTranslator } from "use-intl/core";
import en from "@/messages/en.json";
import { negotiateLocale } from "./accept-language";
import type { Messages } from "./messages";

export type ScanPagesTranslator = ReturnType<
  typeof createTranslator<Messages, "scanPages">
>;

export interface ScanPagesIntl {
  locale: Locale;
  t: ScanPagesTranslator;
}

function translator(locale: Locale, messages: Messages): ScanPagesTranslator {
  return createTranslator({ locale, messages, namespace: "scanPages" });
}

/** English, for callers without a request (and the fallback). */
export const ENGLISH_SCAN_PAGES: ScanPagesIntl = {
  locale: DEFAULT_LOCALE,
  t: translator(DEFAULT_LOCALE, en),
};

// One translator per language and server instance: the catalogs are static.
const loaded = new Map<Locale, Promise<ScanPagesIntl>>();

async function load(locale: Locale): Promise<ScanPagesIntl> {
  try {
    const catalog = (await import(`../../messages/${locale}.json`)).default as {
      scanPages?: unknown;
    };
    // Only this part is merged over English, not the whole catalog.
    const messages = {
      ...en,
      scanPages: mergeMessages(en.scanPages, catalog.scanPages),
    } as Messages;
    return { locale, t: translator(locale, messages) };
  } catch {
    return ENGLISH_SCAN_PAGES;
  }
}

/** The scan pages' translator for `locale` (English for "en" or a missing catalog). */
export function scanPagesIntl(locale: Locale): Promise<ScanPagesIntl> {
  if (locale === DEFAULT_LOCALE) return Promise.resolve(ENGLISH_SCAN_PAGES);
  let intl = loaded.get(locale);
  if (!intl) {
    intl = load(locale);
    loaded.set(locale, intl);
  }
  return intl;
}

/** The translator for a scanner's request, from its Accept-Language. */
export function scanPagesIntlFor(request: {
  headers: Headers;
}): Promise<ScanPagesIntl> {
  return scanPagesIntl(negotiateLocale(request.headers.get("accept-language")));
}
