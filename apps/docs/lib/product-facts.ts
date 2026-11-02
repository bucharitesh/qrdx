// Product counts quoted in copy (docs, compare pages, the blog, llms.txt, the
// FAQ), read from the engine's catalogue so they can't drift from what the
// playground offers. Content files write a token instead of a number:
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

export const PRODUCT_FACTS = {
  /** Shapes for the data modules (`bodyPattern`). */
  bodyPatterns: BODY_PATTERN.length,
  /** Corner eye frames (`cornerEyePattern`); retired shapes aren't counted. */
  eyeShapes: CORNER_EYE_PATTERNS.length,
  /** Dots inside the corner eyes (`cornerEyeDotPattern`). */
  eyeCentres: CORNER_EYE_DOT_PATTERNS.length,
  /** Call-to-action frames (`frame.style`); `none` isn't a frame. */
  frames: FRAME_STYLES.filter((style) => style !== "none").length,
} as const;

export type ProductFact = keyof typeof PRODUCT_FACTS;

/** "<n> body patterns, <n> corner-eye shapes and <n> eye centres" */
export const STYLE_SUMMARY = `${PRODUCT_FACTS.bodyPatterns} body patterns, ${PRODUCT_FACTS.eyeShapes} corner-eye shapes and ${PRODUCT_FACTS.eyeCentres} eye centres`;

export function isProductFact(name: string): name is ProductFact {
  return Object.hasOwn(PRODUCT_FACTS, name);
}

/** The count for a `facts.<name>` token; a typo throws, so it fails the build. */
export function productFact(name: string): number {
  if (!isProductFact(name)) {
    throw new Error(
      `Unknown product fact "facts.${name}". Use one of: ${Object.keys(PRODUCT_FACTS).join(", ")} (lib/product-facts.ts).`,
    );
  }
  return PRODUCT_FACTS[name];
}

const TOKEN = /\{facts\.(\w+)\}/g;

/** Replaces each `{facts.<name>}` in `text` with its count. */
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
