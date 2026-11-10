// Languages the public site is translated into (wave 1 of the i18n design).
// Client-safe: no server imports. English is the source and the canonical,
// unprefixed URL; every other locale lives under its lowercase segment
// (/es, /pt-br, /zh-hans). Whether search engines may index a locale is a
// separate switch: lib/i18n/review.ts.

export const DEFAULT_LOCALE = "en";

export const LOCALES = [
  "en",
  "es",
  "pt-BR",
  "fr",
  "de",
  "it",
  "ja",
  "ko",
  "zh-Hans",
  "id",
  "hi",
] as const;

export type Locale = (typeof LOCALES)[number];
export type TranslatedLocale = Exclude<Locale, typeof DEFAULT_LOCALE>;

export const TRANSLATED_LOCALES = LOCALES.filter(
  (locale): locale is TranslatedLocale => locale !== DEFAULT_LOCALE,
);

export interface LocaleInfo {
  /** The URL segment, and the `[lang]` param: /pt-br/pricing. */
  segment: string;
  /** The language's own name, in its own script (the switcher's label). */
  name: string;
  /** Its English name, for reviewers and the translation prompt. */
  englishName: string;
  /**
   * hreflang values for its pages. One URL may carry several: the
   * Simplified Chinese pages serve readers in mainland China and Singapore.
   */
  hreflang: readonly string[];
  /** og:locale (language_TERRITORY). */
  ogLocale: string;
}

export const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  en: {
    segment: "en",
    name: "English",
    englishName: "English",
    hreflang: ["en"],
    ogLocale: "en_US",
  },
  es: {
    segment: "es",
    name: "Español",
    englishName: "Spanish",
    hreflang: ["es"],
    ogLocale: "es_ES",
  },
  "pt-BR": {
    segment: "pt-br",
    name: "Português (Brasil)",
    englishName: "Brazilian Portuguese",
    hreflang: ["pt-BR"],
    ogLocale: "pt_BR",
  },
  fr: {
    segment: "fr",
    name: "Français",
    englishName: "French",
    hreflang: ["fr"],
    ogLocale: "fr_FR",
  },
  de: {
    segment: "de",
    name: "Deutsch",
    englishName: "German",
    hreflang: ["de"],
    ogLocale: "de_DE",
  },
  it: {
    segment: "it",
    name: "Italiano",
    englishName: "Italian",
    hreflang: ["it"],
    ogLocale: "it_IT",
  },
  ja: {
    segment: "ja",
    name: "日本語",
    englishName: "Japanese",
    hreflang: ["ja"],
    ogLocale: "ja_JP",
  },
  ko: {
    segment: "ko",
    name: "한국어",
    englishName: "Korean",
    hreflang: ["ko"],
    ogLocale: "ko_KR",
  },
  "zh-Hans": {
    segment: "zh-hans",
    name: "简体中文",
    englishName: "Simplified Chinese",
    hreflang: ["zh-CN", "zh-SG"],
    ogLocale: "zh_CN",
  },
  id: {
    segment: "id",
    name: "Bahasa Indonesia",
    englishName: "Indonesian",
    hreflang: ["id"],
    ogLocale: "id_ID",
  },
  hi: {
    segment: "hi",
    name: "हिन्दी",
    englishName: "Hindi",
    hreflang: ["hi"],
    ogLocale: "hi_IN",
  },
};

/** The cookie the language switcher sets (one year). Nothing redirects on it. */
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
