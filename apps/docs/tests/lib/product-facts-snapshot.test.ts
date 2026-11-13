// @repo/config/facts serves a JSON snapshot of lib/product-facts.ts to apps
// that can't import this one (the docs site). The committed snapshot must
// match the live values, and the package's helpers must fill tokens exactly
// like this app's.
import { readFileSync } from "node:fs";
import path from "node:path";
import * as snapshot from "@repo/config/facts";
import { describe, expect, it } from "vitest";
import * as live from "@/lib/product-facts";
import {
  FACTS_SNAPSHOT_FILE,
  productFactsSnapshot,
} from "@/lib/product-facts-snapshot";

const repo = path.resolve(import.meta.dirname, "../../../..");
const STALE = `${FACTS_SNAPSHOT_FILE} is out of date with apps/docs/lib/product-facts.ts. Run \`bun run --filter docs facts:snapshot\` and commit the result.`;

describe("facts.generated.json", () => {
  it("matches lib/product-facts.ts", () => {
    const committed = readFileSync(
      path.join(repo, FACTS_SNAPSHOT_FILE),
      "utf8",
    );
    expect(committed, STALE).toBe(productFactsSnapshot());
  });
});

describe("@repo/config/facts", () => {
  const names = Object.keys(live.PRODUCT_FACTS);

  it("serves the live values", () => {
    expect(snapshot.PRODUCT_FACTS, STALE).toEqual(live.PRODUCT_FACTS);
    expect(snapshot.STYLE_SUMMARY, STALE).toBe(live.STYLE_SUMMARY);
  });

  it("fills tokens like the app", () => {
    const every = names.map((name) => `{facts.${name}}`).join(" · ");
    expect(snapshot.fillFacts(every)).toBe(live.fillFacts(every));

    const frontmatter = {
      title: "{facts.bodyPatterns} body patterns",
      rows: [{ qrdx: "{facts.eyeShapes}", ok: true }, { qrdx: false }],
      when: 3,
    };
    expect(snapshot.fillFactsDeep(frontmatter)).toEqual(
      live.fillFactsDeep(frontmatter),
    );

    for (const name of names) {
      expect(snapshot.isProductFact(name)).toBe(true);
      expect(snapshot.productFact(name)).toBe(live.productFact(name));
    }
  });

  it("rejects names that aren't facts", () => {
    for (const name of ["bodyPattern", "toString", "constructor"]) {
      expect(snapshot.isProductFact(name)).toBe(live.isProductFact(name));
      expect(() => snapshot.productFact(name)).toThrow(
        `Unknown product fact "facts.${name}"`,
      );
    }
    expect(() => snapshot.fillFacts("{facts.nope}")).toThrow(
      'Unknown product fact "facts.nope"',
    );
  });
});
