// What stays English inside data that's otherwise translated
// (lib/i18n/content.ts). Shared by lib/i18n/content-sources.ts, which
// decides what gets translated, and the pages that render the data, so a
// value that happens to match a translated string is never swapped.

import { navAreas } from "@/components/app-shell/nav-areas";
import { mainNav, settingsNav } from "@/components/app-shell/nav-config";
import { CONTENT_CATEGORIES, CONTENT_TYPES_METADATA } from "@/types/qr-content";
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

/**
 * The editor's type picker: each type's name and description, and the
 * groups' names. Search words stay English (they match English input too),
 * and a group's `types` are ids.
 */
export const EDITOR_CONTENT = {
  list: CONTENT_TYPES_METADATA,
  groups: CONTENT_CATEGORIES,
};
export const EDITOR_CONTENT_RULES: ContentRules = {
  skip: ["keywords", "types"],
};

/**
 * The signed-in app's navigation (components/app-shell): sidebar groups,
 * items, areas and their titles. Search words stay English.
 */
export const APP_NAV_CONTENT = () => ({
  main: mainNav("workspace"),
  settings: settingsNav("workspace"),
  areas: navAreas("workspace"),
  accountAreas: navAreas(null),
});
export const APP_NAV_RULES: ContentRules = { skip: ["keywords"] };
