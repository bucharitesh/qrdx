// Product counts and names quoted in copy, for apps that can't import the
// main app (the docs site), imported as "@repo/config/facts".
// apps/app/lib/product-facts.ts is the only source of truth: it reads the
// engine's catalogue, pricing, the affiliate terms, the AI art model and the
// audit log limits. Another app gets the values as a snapshot that
// `bun run --filter app facts:snapshot` writes to
// packages/config/facts.generated.json just before that app builds. The file
// isn't committed, so it can't go stale between merges.
//
// createFacts() gives that app the same API the main app uses, so a
// `{facts.<name>}` token fills the same way in either.

/** Where the snapshot is written, from the repository root (not committed). */
export const FACTS_SNAPSHOT_FILE = "packages/config/facts.generated.json";

/** The snapshot's shape. */
export interface FactsSnapshot {
  facts: Record<string, number | string>;
  styleSummary: string;
}

export interface Facts {
  PRODUCT_FACTS: Readonly<Record<string, number | string>>;
  /** "<n> body patterns, <n> corner-eye shapes and <n> eye centers" */
  STYLE_SUMMARY: string;
  isProductFact: (name: string) => boolean;
  /** The value of a `facts.<name>` token; a typo throws, so it fails the build. */
  productFact: (name: string) => number | string;
  /** Replaces each `{facts.<name>}` in `text` with its value. */
  fillFacts: (text: string) => string;
  /** fillFacts over every string in a frontmatter value (objects and arrays too). */
  fillFactsDeep: <T>(value: T) => T;
}

const TOKEN = /\{facts\.(\w+)\}/g;

export function createFacts(snapshot: FactsSnapshot): Facts {
  const PRODUCT_FACTS = Object.freeze({ ...snapshot.facts });

  const isProductFact = (name: string) => Object.hasOwn(PRODUCT_FACTS, name);

  const productFact = (name: string): number | string => {
    if (!isProductFact(name)) {
      throw new Error(
        `Unknown product fact "facts.${name}". Use one of: ${Object.keys(PRODUCT_FACTS).join(", ")} (apps/app/lib/product-facts.ts).`
      );
    }
    return PRODUCT_FACTS[name] as number | string;
  };

  const fillFacts = (text: string) =>
    text.replace(TOKEN, (_, name: string) => String(productFact(name)));

  const fillFactsDeep = <T>(value: T): T => {
    if (typeof value === "string") return fillFacts(value) as T;
    if (Array.isArray(value)) return value.map(fillFactsDeep) as T;
    if (value && typeof value === "object" && value.constructor === Object) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, fillFactsDeep(item)])
      ) as T;
    }
    return value;
  };

  return {
    PRODUCT_FACTS,
    STYLE_SUMMARY: snapshot.styleSummary,
    isProductFact,
    productFact,
    fillFacts,
    fillFactsDeep,
  };
}
