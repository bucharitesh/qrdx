// Another app (the docs site) reads product facts through @repo/config/facts,
// from a snapshot of lib/product-facts.ts written just before it builds. The
// snapshot must carry every live value through JSON, and the package's
// helpers must fill tokens exactly like this app's.
import { createFacts, type FactsSnapshot } from "@repo/config/facts";
import { describe, expect, it } from "vitest";
import * as live from "@/lib/product-facts";
import { productFactsSnapshot } from "@/lib/product-facts-snapshot";

const snapshot = createFacts(
  JSON.parse(productFactsSnapshot()) as FactsSnapshot,
);
const names = Object.keys(live.PRODUCT_FACTS);

describe("product facts snapshot", () => {
  it("is JSON with a trailing newline and sorted keys", () => {
    const text = productFactsSnapshot();
    expect(text.endsWith("}\n")).toBe(true);
    const keys = Object.keys(JSON.parse(text).facts);
    expect(keys).toEqual([...keys].sort((a, b) => (a < b ? -1 : 1)));
  });

  it("carries the live values", () => {
    expect(snapshot.PRODUCT_FACTS).toEqual(live.PRODUCT_FACTS);
    expect(snapshot.STYLE_SUMMARY).toBe(live.STYLE_SUMMARY);
  });
});

describe("@repo/config/facts", () => {
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
