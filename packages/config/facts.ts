// Product counts and names quoted in copy, for apps that can't import the
// main app (the docs site), imported as "@repo/config/facts". The values come
// from facts.generated.json, a snapshot of apps/docs/lib/product-facts.ts:
// that module stays the source of truth (it reads the engine's catalogue,
// pricing, the affiliate terms, the AI art model and the audit log limits),
// and the main app keeps reading it directly. The API matches it, so a
// `{facts.<name>}` token fills the same way in either app.
//
// After changing a fact, rewrite the snapshot with
// `bun run --filter docs facts:snapshot`; apps/docs/tests/lib/
// product-facts-snapshot.test.ts fails while it's stale.

import snapshot from "./facts.generated.json";

export const PRODUCT_FACTS = Object.freeze(snapshot.facts);

export type ProductFact = keyof typeof PRODUCT_FACTS;

/** "<n> body patterns, <n> corner-eye shapes and <n> eye centers" */
export const STYLE_SUMMARY: string = snapshot.styleSummary;

export function isProductFact(name: string): name is ProductFact {
  return Object.hasOwn(PRODUCT_FACTS, name);
}

/** The value of a `facts.<name>` token; a typo throws, so it fails the build. */
export function productFact(name: string): number | string {
  if (!isProductFact(name)) {
    throw new Error(
      `Unknown product fact "facts.${name}". Use one of: ${Object.keys(PRODUCT_FACTS).join(", ")} (apps/docs/lib/product-facts.ts).`
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
      Object.entries(value).map(([key, item]) => [key, fillFactsDeep(item)])
    ) as T;
  }
  return value;
}
