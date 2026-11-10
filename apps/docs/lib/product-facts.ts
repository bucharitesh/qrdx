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
// Keep this module light (no React, no "server-only"): source.config.ts and
// client-side config import it.
//
// The catalogues come from the engine's source, not "qrdx/types": that export
// points at dist/, which doesn't exist yet when `pnpm install` runs the docs
// postinstall (fumadocs-mdx loads source.config.ts, which imports this file),
// so CI and Vercel failed at install. These files only depend on zod.
import { CORNER_EYE_DOT_PATTERNS } from "../../../packages/qrdx/types/corner-dot";
import { CORNER_EYE_PATTERNS } from "../../../packages/qrdx/types/corner-eye";
import { FRAME_STYLES } from "../../../packages/qrdx/types/frame";
import { BODY_PATTERN } from "../../../packages/qrdx/types/image-pattern";
import {
  AUDIT_EXPORT_MAX_ROWS,
  AUDIT_RETENTION_DAYS,
} from "../ee/audit-log/limits";
import { ART_MODEL_LABEL } from "./ai/art-models";
import { BARCODE_FORMATS } from "./barcode/formats";

export const PRODUCT_FACTS = {
  /** Shapes for the data modules (`bodyPattern`). */
  bodyPatterns: BODY_PATTERN.length,
  /** Corner eye frames (`cornerEyePattern`); retired shapes aren't counted. */
  eyeShapes: CORNER_EYE_PATTERNS.length,
  /** Dots inside the corner eyes (`cornerEyeDotPattern`). */
  eyeCentres: CORNER_EYE_DOT_PATTERNS.length,
  /** Call-to-action frames (`frame.style`); `none` isn't a frame. */
  frames: FRAME_STYLES.filter((style) => style !== "none").length,
  /** The AI art model as copy names it ("OpenAI's GPT Image 2"), from lib/ai/models.ts. */
  artModel: ART_MODEL_LABEL,
  /** Days the workspace audit log keeps a row (ee/audit-log/limits.ts). */
  auditLogRetentionDays: AUDIT_RETENTION_DAYS,
  /** Rows in one audit log CSV export, as copy writes it ("50,000"). */
  auditLogExportRows: AUDIT_EXPORT_MAX_ROWS.toLocaleString("en-US"),
  /** Symbologies /barcode-generator draws (lib/barcode/formats.ts). */
  barcodeFormats: BARCODE_FORMATS.length,
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
