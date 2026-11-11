// The languages the public site is translated into. Client-safe: no server
// imports.
//
// Adding a language is data only (CONTRIBUTING.md, "Translating QRdx"):
// one entry here, its catalog in messages/<locale>.json (a partial one
// works: missing strings fall back to English) and, optionally, glossary
// terms in messages/glossary.json. Routes, the language menu, metadata,
// hreflang and the sitemap all read this list.
//
// English is the source and the canonical, unprefixed URL; every other
// locale lives under its lowercase segment (/es, /pt-br, /zh-hans).

export type ReviewState =
  /** Machine-translated or not reviewed yet: noindex, no sitemap, no hreflang. */
  | "machine"
  /** A native speaker signed it off: indexed, in the sitemap and in hreflang. */
  | "reviewed"
  /** Only these pages are signed off ("/", "/pricing"). */
  | readonly string[];

export interface LocaleDefinition {
  /** The URL segment, lowercase: /pt-br/pricing. Also the `[lang]` param. */
  segment: string;
  /** The language's own name, in its own script (the language menu). */
  name: string;
  /** Its English name, for reviewers and the translation prompt. */
  englishName: string;
  /**
   * hreflang values for its pages (BCP 47). One URL may carry several: the
   * Simplified Chinese pages serve readers in mainland China and Singapore.
   */
  hreflang: readonly string[];
  /** og:locale (language_TERRITORY). */
  ogLocale: string;
  /**
   * Writing direction, set on <html dir>. Right-to-left layout (logical CSS
   * properties, mirrored icons, an Arabic font) isn't done yet: an "rtl"
   * locale renders, but needs that work before review.
   */
  dir: "ltr" | "rtl";
  /** Whether search engines may index it (lib/i18n/review.ts). */
  review: ReviewState;
  /**
   * The docs are translated into it (content/docs/<page>.<locale>.mdx,
   * lib/i18n/docs.ts). Without it, its pages link to the English docs.
   */
  docs?: boolean;
}

export const DEFAULT_LOCALE = "en";

/** Every language, English first. The key is its BCP 47 code. */
export const LOCALE_CONFIG = {
  en: {
    segment: "en",
    name: "English",
    englishName: "English",
    hreflang: ["en"],
    ogLocale: "en_US",
    dir: "ltr",
    review: "reviewed",
    docs: true,
  },
  es: {
    segment: "es",
    name: "Español",
    englishName: "Spanish",
    hreflang: ["es"],
    ogLocale: "es_ES",
    dir: "ltr",
    review: "machine",
    docs: true,
  },
  "pt-BR": {
    segment: "pt-br",
    name: "Português (Brasil)",
    englishName: "Brazilian Portuguese",
    hreflang: ["pt-BR"],
    ogLocale: "pt_BR",
    dir: "ltr",
    review: "machine",
    docs: true,
  },
  fr: {
    segment: "fr",
    name: "Français",
    englishName: "French",
    hreflang: ["fr"],
    ogLocale: "fr_FR",
    dir: "ltr",
    review: "machine",
  },
  de: {
    segment: "de",
    name: "Deutsch",
    englishName: "German",
    hreflang: ["de"],
    ogLocale: "de_DE",
    dir: "ltr",
    review: "machine",
  },
  it: {
    segment: "it",
    name: "Italiano",
    englishName: "Italian",
    hreflang: ["it"],
    ogLocale: "it_IT",
    dir: "ltr",
    review: "machine",
  },
  ja: {
    segment: "ja",
    name: "日本語",
    englishName: "Japanese",
    hreflang: ["ja"],
    ogLocale: "ja_JP",
    dir: "ltr",
    review: "machine",
    docs: true,
  },
  ko: {
    segment: "ko",
    name: "한국어",
    englishName: "Korean",
    hreflang: ["ko"],
    ogLocale: "ko_KR",
    dir: "ltr",
    review: "machine",
  },
  "zh-Hans": {
    segment: "zh-hans",
    name: "简体中文",
    englishName: "Simplified Chinese",
    hreflang: ["zh-CN", "zh-SG"],
    ogLocale: "zh_CN",
    dir: "ltr",
    review: "machine",
    docs: true,
  },
  id: {
    segment: "id",
    name: "Bahasa Indonesia",
    englishName: "Indonesian",
    hreflang: ["id"],
    ogLocale: "id_ID",
    dir: "ltr",
    review: "machine",
  },
  hi: {
    segment: "hi",
    name: "हिन्दी",
    englishName: "Hindi",
    hreflang: ["hi"],
    ogLocale: "hi_IN",
    dir: "ltr",
    review: "machine",
  },
} as const satisfies Record<string, LocaleDefinition>;

export type Locale = keyof typeof LOCALE_CONFIG;
export type TranslatedLocale = Exclude<Locale, typeof DEFAULT_LOCALE>;

/** Every locale, English first, in the language menu's order. */
export const LOCALES = Object.keys(LOCALE_CONFIG) as Locale[];

export const TRANSLATED_LOCALES = LOCALES.filter(
  (locale): locale is TranslatedLocale => locale !== DEFAULT_LOCALE,
);

/** A locale's definition, typed as the general shape. */
export const LOCALE_INFO: Record<Locale, LocaleDefinition> = LOCALE_CONFIG;

/** The cookie the language menu sets (one year). Nothing redirects on it. */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** "pt-br" → "pt-BR"; undefined for anything that isn't a locale segment. */
export function localeFromSegment(
  segment: string | null | undefined,
): Locale | undefined {
  if (!segment) return undefined;
  return LOCALES.find((locale) => LOCALE_INFO[locale].segment === segment);
}

/** The `[lang]` values that are prerendered (every locale, English too). */
export const LOCALE_SEGMENTS = LOCALES.map(
  (locale) => LOCALE_INFO[locale].segment,
);
