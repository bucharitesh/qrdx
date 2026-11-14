// The docs' search-engine rules live in @repo/i18n
// (packages/i18n/docs-seo.ts), so QRdx's other apps share them. This path
// stays for the app's imports and gives the helpers that write absolute
// URLs the app's origin.

import { createDocsSeo } from "@repo/i18n/docs-seo";
import { baseUrl } from "@/lib/metadata";

export { type DocsPageSeo, indexableDocsLocales } from "@repo/i18n/docs-seo";

export const { docsLanguageAlternates, docsPageSeo, docsSitemapEntries } =
  createDocsSeo(baseUrl);
