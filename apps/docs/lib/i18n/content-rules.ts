// What stays English inside data that's otherwise translated
// (lib/i18n/content.ts). Shared by lib/i18n/content-sources.ts, which
// decides what gets translated, and the pages that render the data, so a
// value that happens to match a translated string is never swapped.
import type { ContentRules } from "./content";

/** lib/qr-types-content.ts: the payload format and example are what the code encodes. */
export const QR_TYPE_RULES: ContentRules = { skip: ["format", "example"] };

/** lib/landing/page-codes: only the tile label is copy; frames carry the drawn call to action. */
export const PAGE_CODE_RULES: ContentRules = {
  skip: ["preset", "frame", "sample"],
};

/** lib/barcode formats and files: symbology and file-type names stay as they are. */
export const BARCODE_CONTENT_RULES: ContentRules = {
  skip: ["label", "mime", "example", "detectorFormats"],
};

/** Page templates: names and descriptions only; demo blocks are sample pages. */
export const TEMPLATE_RULES: ContentRules = {
  skip: ["blocks", "theme", "template"],
};

/** packages/integrations catalog: names, code and identifiers stay as they are. */
export const INTEGRATION_RULES: ContentRules = {
  skip: [
    "name",
    "code",
    "keywords",
    "builtBy",
    "website",
    "docs",
    "language",
    "logo",
    "canonicalPath",
    "publisher",
    "text",
    "plan",
    "categories",
    "surface",
  ],
};

/** The /mcp page: tool names are what assistants call; client names and code stay. */
export const MCP_RULES: ContentRules = {
  skip: ["name", "file", "code", "language", "href"],
};
