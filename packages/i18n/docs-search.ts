// Docs search per language (app/api/search): one index per language with
// docs, each with a tokenizer that suits it. English keeps the tokenizer it
// always had; the languages zbsearch knows use its own (Hindi is "indian").
// Japanese and Chinese don't separate words with spaces, so their text is
// split into words with Intl.Segmenter (ICU's dictionaries), the same way at
// indexing and at query time; Korean goes the same way. A new docs language
// without an entry here gets fumadocs' multilingual tokenizer.
import type { Locale } from "./config";

/** zbsearch's tokenizer interface (components.tokenizer). */
export interface SearchTokenizer {
  language: string;
  normalizationCache: Map<string, string>;
  tokenize: (raw: string) => string[];
}

/**
 * Words as Intl.Segmenter finds them in `locale`, lowercased. NFKC first,
 * so full-width letters and digits (ＱＲ, ５) match their ASCII forms and
 * half-width katakana its full-width form.
 */
export function segmenterTokenizer(locale: string): SearchTokenizer {
  const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
  return {
    language: locale,
    normalizationCache: new Map(),
    tokenize(raw) {
      if (typeof raw !== "string") return [raw];
      const words: string[] = [];
      for (const { segment, isWordLike } of segmenter.segment(
        raw.normalize("NFKC").toLowerCase()
      )) {
        if (isWordLike) words.push(segment);
      }
      return words;
    },
  };
}

type SearchLanguage = string | { tokenizer: SearchTokenizer };

/** The tokenizer for each language with docs (zbsearch language names). */
export function docsSearchLanguages(): Partial<Record<Locale, SearchLanguage>> {
  return {
    en: "english",
    es: "spanish",
    "pt-BR": "portuguese",
    fr: "french",
    de: "german",
    it: "italian",
    ja: { tokenizer: segmenterTokenizer("ja") },
    ko: { tokenizer: segmenterTokenizer("ko") },
    "zh-Hans": { tokenizer: segmenterTokenizer("zh-Hans") },
    id: "indonesian",
    hi: "indian",
  };
}
