// The files that hold each TypeScript-written page's content, for the
// sitemap's lastmod (git dates, lib/seo-dates.ts). List the copy, not the
// layout: a page counts as modified when its words change. Paths are
// relative to apps/docs. tests/lib/seo-page-sources.test.ts checks they exist.
//
// Pages built from many components (home, community, the playground) have no
// entry and no lastmod; a guessed date would be worse than none.
import type { SeoCollection } from "@/lib/seo-content";

export const PAGE_SOURCES: Readonly<Record<string, readonly string[]>> = {
  "/pricing": [
    "app/[lang]/(home)/pricing/page.tsx",
    "components/sections/pricing/plan-content.ts",
    "lib/plans.ts",
    "lib/pricing.ts",
  ],
  "/guarantee": ["app/[lang]/(home)/guarantee/page.tsx"],
  "/affiliates": [
    "app/(app)/(home)/affiliates/page.tsx",
    "lib/affiliates/terms.ts",
  ],
  "/mcp": ["app/[lang]/(home)/mcp/page.tsx"],
  "/plugins": [
    "app/[lang]/(home)/plugins/page.tsx",
    "app/[lang]/(home)/plugins/plugin-data.ts",
  ],
  // The chat bots' landing pages; the layout and mockups are in
  // components/sections/chat-bots.
  "/slack": ["app/(app)/(home)/slack/page.tsx"],
  "/telegram": ["app/(app)/(home)/telegram/page.tsx"],
  "/discord": ["app/(app)/(home)/discord/page.tsx"],
  "/templates": ["app/[lang]/(home)/templates/page.tsx"],
  "/tools": ["app/[lang]/(home)/tools/page.tsx"],
  "/tools/bulk": ["app/[lang]/(home)/tools/bulk/page.tsx"],
  "/tools/print-size": ["app/[lang]/(home)/tools/print-size/page.tsx"],
  "/tools/scan-checker": ["app/[lang]/(home)/tools/scan-checker/page.tsx"],
  "/scan": ["app/[lang]/(home)/scan/page.tsx"],
  "/barcode-generator": [
    "app/[lang]/(home)/barcode-generator/page.tsx",
    "lib/barcode/formats.ts",
  ],
  // Every /barcode-generator/<format> page.
  "/barcode-generator/[format]": [
    "app/[lang]/(home)/barcode-generator/[format]/content.ts",
    "lib/barcode/formats.ts",
  ],
};

/** Every /qr-code-generator/<type> page's copy lives in one file. */
export const QR_TYPES_SOURCE = "lib/qr-types-content.ts";

/** /qr-code-generator/pdf and /business-card, which open hosted pages. */
export const HOSTED_TYPES_SOURCE = "lib/qr-types-content-hosted.ts";

/** An industry or placement group's copy: lib/seo-content/<collection>/<group id>.ts */
export function seoGroupSource(
  collection: Pick<SeoCollection, "id">,
  groupId: string,
): string {
  return `lib/seo-content/${collection.id}/${groupId}.ts`;
}
