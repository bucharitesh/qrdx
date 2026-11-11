import { createFromSource } from "fumadocs-core/search/server";
import { docsSearchLanguages } from "@/lib/i18n/docs-search";
import { localizedSource } from "@/lib/source";

// One index per docs language (?locale=es), each with its own tokenizer
// (lib/i18n/docs-search.ts). A language's index holds its translated pages
// and the English pages that aren't translated yet, at its own URLs.
// https://docs.orama.com/docs/orama-js/supported-languages
export const { GET } = createFromSource(localizedSource, {
  localeMap: docsSearchLanguages(),
});
