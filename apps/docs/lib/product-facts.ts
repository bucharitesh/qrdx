// Product counts quoted in copy (docs, compare pages, the blog, llms.txt, the
// FAQ), read from the engine's catalogue so they can't drift from what the
// playground offers, and the AI art model's name, read from the model map.
// Content files write a token instead of a number or name:
//
//   MDX body:     There are {facts.bodyPatterns} body patterns.
//   frontmatter:  description: "{facts.bodyPatterns} body patterns, …"
//
// lib/remark-product-facts.ts and the content schemas in source.config.ts swap
// in the number at build time, so the rendered page, its Markdown copy and the
// search index all show it. tests/lib/product-facts.test.ts fails when a
// hard-coded count comes back.
//
// Apps that can't import this one (the docs site) read these values through
// @repo/config/facts, from a snapshot (packages/config/facts.generated.json)
// that `bun run --filter docs facts:snapshot` writes right before they build.
// It isn't committed, so there's nothing to refresh by hand.
//
// Keep this module light (no React, no "server-only"): source.config.ts and
// client-side config import it.
//
// The catalogues come from the engine's source, not "qrdx/types": that export
// points at dist/, which doesn't exist yet when `bun install` runs the docs
// postinstall (fumadocs-mdx loads source.config.ts, which imports this file),
// so CI and Vercel failed at install. These files only depend on zod.

import {
  DESIGN_QR_REQUESTS_PER_MINUTE,
  MAX_BULK_TOOL_ROWS,
  MAX_CODES_PER_REQUEST,
  MAX_IMPORT_ROWS,
  MCP_REQUESTS_PER_MINUTE,
  NEW_PAID_ACCOUNT_CODES_PER_HOUR,
  QR_IMAGE_REQUESTS_PER_MINUTE,
} from "@repo/config";
import { formatCount } from "@/lib/format-count";
import {
  OFFICIAL_FRAME_COUNT,
  OFFICIAL_FRAME_COUNTS,
} from "../../../packages/qrdx/src/frames/catalogue/counts";
import { CORNER_EYE_DOT_PATTERNS } from "../../../packages/qrdx/types/corner-dot";
import { CORNER_EYE_PATTERNS } from "../../../packages/qrdx/types/corner-eye";
import { FRAME_STYLES } from "../../../packages/qrdx/types/frame";
import { BODY_PATTERN } from "../../../packages/qrdx/types/image-pattern";
import { AI_ART_PRESET_COUNT } from "../components/sections/ai-art/preset-meta";
import {
  AUDIT_EXPORT_MAX_ROWS,
  AUDIT_RETENTION_DAYS,
} from "../ee/audit-log/limits";
import { CONTENT_TYPE_IDS } from "../types/content-type-ids";
import {
  AFFILIATE_COMMISSION_MONTHS,
  AFFILIATE_COMMISSION_PERCENT,
  AFFILIATE_HOLD_DAYS,
  AFFILIATE_MIN_PAYOUT_LABEL,
  AFFILIATE_TERMS_NOTICE_DAYS,
} from "./affiliates/terms";
import { ART_MODEL_LABEL } from "./ai/art-models";
import { BARCODE_FORMATS } from "./barcode/formats";
import { BRAND_LOGO_COUNT } from "./brand-logos/catalog.generated";
import { TRANSLATED_LOCALES } from "./i18n/config";
import { PAGE_TYPE_IDS } from "./landing/page-type-ids";
import { MONEY_BACK_DAYS, NONPROFIT_DISCOUNT_PERCENT } from "./pricing";
import { FREE_SCAN_HISTORY_YEARS } from "./scan-history";

export const PRODUCT_FACTS = {
  /** Shapes for the data modules (`bodyPattern`). */
  bodyPatterns: BODY_PATTERN.length,
  /** Corner eye frames (`cornerEyePattern`); retired shapes aren't counted. */
  eyeShapes: CORNER_EYE_PATTERNS.length,
  /** Dots inside the corner eyes (`cornerEyeDotPattern`). */
  eyeCentres: CORNER_EYE_DOT_PATTERNS.length,
  /**
   * Every frame QRdx has: the built-in frames plus the official frame
   * library. Both are frame specs; the built-in ones live in qrdx
   * BUILT_IN_FRAMES, not in OFFICIAL_FRAMES, so none is counted twice.
   */
  frames:
    FRAME_STYLES.filter((style) => style !== "none").length +
    OFFICIAL_FRAME_COUNT,
  /**
   * Built-in frames (qrdx BUILT_IN_FRAMES): one frame spec per
   * `frame.style` name, which designs keep naming them by. `none` isn't a
   * frame.
   */
  frameStyles: FRAME_STYLES.filter((style) => style !== "none").length,
  /** Official frames (frame specs in qrdx OFFICIAL_FRAMES). */
  officialFrames: OFFICIAL_FRAME_COUNT,
  /** Official frames for holidays and seasons. */
  seasonalFrames:
    OFFICIAL_FRAME_COUNTS.holidays + OFFICIAL_FRAME_COUNTS.seasons,
  /** The AI art model as copy names it ("OpenAI's GPT Image 2"), from lib/ai/models.ts. */
  artModel: ART_MODEL_LABEL,
  // AI art style presets (components/sections/ai-art/preset-meta.ts, checked
  // against the catalogue in presets.ts).
  /** AI art style presets in the picker. */
  aiArtStyles: AI_ART_PRESET_COUNT,
  /** Days the workspace audit log keeps a row (ee/audit-log/limits.ts). */
  auditLogRetentionDays: AUDIT_RETENTION_DAYS,
  /** Rows in one audit log CSV export, as copy writes it ("50,000"). */
  auditLogExportRows: AUDIT_EXPORT_MAX_ROWS.toLocaleString("en-US"),
  /** Symbologies /barcode-generator draws (lib/barcode/formats.ts). */
  barcodeFormats: BARCODE_FORMATS.length,
  /** Hosted page types in the New code picker (lib/landing/page-type-ids.ts). */
  hostedPageTypes: PAGE_TYPE_IDS.length,
  /** Static content types in the playground's picker (types/content-type-ids.ts). */
  contentTypes: CONTENT_TYPE_IDS.length,
  /** Brands in the logo gallery (Simple Icons), as copy writes it ("3,467"). */
  brandLogos: BRAND_LOGO_COUNT.toLocaleString("en-US"),
  /** Languages the site has besides English (lib/i18n/config.ts), reviewed or not. */
  translatedLanguages: TRANSLATED_LOCALES.length,
  // The affiliate program's terms (lib/affiliates/terms.ts), for the legal
  // and help pages; the code reads the same constants.
  /** The commission, as copy writes it: "30" (followed by "%"). */
  affiliateCommissionPercent: AFFILIATE_COMMISSION_PERCENT,
  /** Months of a customer's payments that earn: "12". */
  affiliateCommissionMonths: AFFILIATE_COMMISSION_MONTHS,
  /** Days each commission waits: "30". */
  affiliateHoldDays: AFFILIATE_HOLD_DAYS,
  /** One minimum across currencies: "US$25" */
  affiliateMinPayoutUsd: AFFILIATE_MIN_PAYOUT_LABEL,
  /** Days of notice before the affiliate terms change: "30". */
  affiliateTermsNoticeDays: AFFILIATE_TERMS_NOTICE_DAYS,
  // Large batches (@repo/config limits.ts), as copy writes them ("1,000").
  /** Dynamic codes in one POST /v1/codes request. */
  apiBatchCodes: formatCount(MAX_CODES_PER_REQUEST),
  /** Rows in one dashboard CSV import. */
  importRows: formatCount(MAX_IMPORT_ROWS),
  /** Rows in one file of the free bulk tool. */
  bulkToolRows: formatCount(MAX_BULK_TOOL_ROWS),
  /** Codes an hour a new account may create in a paid workspace. */
  newPaidAccountHourlyCodes: formatCount(NEW_PAID_ACCOUNT_CODES_PER_HOUR),
  // Keyless endpoints' per-IP limits (@repo/config limits.ts).
  /** Image API (GET /v1/qr) requests a minute per IP address. */
  imageApiPerMinute: QR_IMAGE_REQUESTS_PER_MINUTE,
  /** MCP server requests a minute per IP address. */
  mcpPerMinute: MCP_REQUESTS_PER_MINUTE,
  /** design_qr calls a minute per IP address. */
  designQrPerMinute: DESIGN_QR_REQUESTS_PER_MINUTE,
  // Pricing offers (lib/pricing.ts), for the refund policy, help and compare pages.
  /** Days to ask for a full refund of the first payment for a paid plan: "30". */
  moneyBackDays: MONEY_BACK_DAYS,
  /** The non-profit discount, as copy writes it: "50" (followed by "%"). */
  nonprofitDiscountPercent: NONPROFIT_DISCOUNT_PERCENT,
  /**
   * Years of scan history Free shows (lib/scan-history.ts): "1", followed by
   * "year". Pro and Business keep all of it, which copy writes as words.
   */
  freeScanHistoryYears: FREE_SCAN_HISTORY_YEARS,
} as const;

export type ProductFact = keyof typeof PRODUCT_FACTS;

/** "<n> body patterns, <n> corner-eye shapes and <n> eye centers" */
export const STYLE_SUMMARY = `${PRODUCT_FACTS.bodyPatterns} body patterns, ${PRODUCT_FACTS.eyeShapes} corner-eye shapes and ${PRODUCT_FACTS.eyeCentres} eye centers`;

export function isProductFact(name: string): name is ProductFact {
  return Object.hasOwn(PRODUCT_FACTS, name);
}

/** The value of a `facts.<name>` token; a typo throws, so it fails the build. */
export function productFact(name: string): number | string {
  if (!isProductFact(name)) {
    throw new Error(
      `Unknown product fact "facts.${name}". Use one of: ${Object.keys(PRODUCT_FACTS).join(", ")} (lib/product-facts.ts).`,
    );
  }
  return PRODUCT_FACTS[name];
}

const TOKEN = /\{facts\.(\w+)\}/g;

/** Replaces each `{facts.<name>}` in `text` with its value. */
export function fillFacts(text: string): string {
  return text.replace(TOKEN, (_, name: string) => String(productFact(name)));
}

/** fillFacts over every string in a frontmatter value (objects and arrays too). */
export function fillFactsDeep<T>(value: T): T {
  if (typeof value === "string") return fillFacts(value) as T;
  if (Array.isArray(value)) return value.map(fillFactsDeep) as T;
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fillFactsDeep(item)]),
    ) as T;
  }
  return value;
}
