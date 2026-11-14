import { createFromSource } from "fumadocs-core/search/server";
import { localizedDocsIndex } from "@/lib/docs-index";
import { docsSearchLanguages } from "@/lib/i18n/docs-search";

// One index per docs language (?locale=es), each with its own tokenizer
// (lib/i18n/docs-search.ts). A language's index holds its translated pages
// and the English pages that aren't translated yet, at its own URLs.
// https://docs.orama.com/docs/orama-js/supported-languages
export const { GET } = createFromSource(localizedDocsIndex, {
  localeMap: docsSearchLanguages(),
});
