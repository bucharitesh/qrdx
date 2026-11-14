// Product counts and names quoted in the docs (`{facts.bodyPatterns}` in MDX
// and frontmatter). The main app's apps/docs/lib/product-facts.ts is the
// source of truth; this reads its snapshot, packages/config/
// facts.generated.json, which `bun run --filter docs facts:snapshot` writes
// before every dev server, build, typecheck and test here
// (scripts/zone-inputs.mjs).
import { createFacts } from "@repo/config/facts";
import snapshot from "@repo/config/facts.generated.json";

export const {
  PRODUCT_FACTS,
  STYLE_SUMMARY,
  fillFacts,
  fillFactsDeep,
  isProductFact,
  productFact,
} = createFacts(snapshot);
