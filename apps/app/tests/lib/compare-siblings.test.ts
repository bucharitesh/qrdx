// "More comparisons" on /compare/<slug> (lib/compare-siblings.ts): a rotation,
// so no comparison is left without sibling links. Runs on the real compare
// frontmatter as well as on small made-up lists.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type CompareSibling,
  pickCompareSiblings,
} from "@/lib/compare-siblings";

const COMPARE = join(import.meta.dirname, "..", "..", "content", "compare");
const SHOWN = 6;

/** slug, competitor and category (the schema's default is "generator"). */
const realPages: CompareSibling[] = readdirSync(COMPARE)
  .filter((file) => file.endsWith(".mdx"))
  .map((file) => {
    const text = readFileSync(join(COMPARE, file), "utf8");
    const field = (name: string) =>
      new RegExp(`^${name}:\\s*(.+)$`, "m")
        .exec(text)?.[1]
        ?.trim()
        .replace(/^"(.*)"$/, "$1");
    return {
      slug: file.replace(/\.mdx$/, ""),
      name: field("competitor") ?? "",
      category: field("category") ?? "generator",
    };
  });

const page = (slug: string, category = "generator"): CompareSibling => ({
  slug,
  name: slug,
  category,
});

describe("pickCompareSiblings", () => {
  it("takes the pages that follow the current one, wrapping around", () => {
    const pages = ["a", "b", "c", "d", "e"].map((slug) => page(slug));
    const slugs = (current: string) =>
      pickCompareSiblings(pages, current, 3).map((p) => p.slug);
    expect(slugs("a")).toEqual(["b", "c", "d"]);
    expect(slugs("d")).toEqual(["e", "a", "b"]);
    expect(slugs("e")).toEqual(["a", "b", "c"]);
  });

  it("never links a page to itself or repeats a page", () => {
    const pages = ["a", "b", "c"].map((slug) => page(slug));
    for (const current of ["a", "b", "c"]) {
      const picked = pickCompareSiblings(pages, current, SHOWN).map(
        (p) => p.slug,
      );
      expect(picked).not.toContain(current);
      expect(new Set(picked).size).toBe(picked.length);
      expect(picked).toHaveLength(2);
    }
  });

  it("puts the same kind of tool first and fills from the other kind", () => {
    const pages = [
      page("lib-a", "library"),
      page("lib-b", "library"),
      ...["g1", "g2", "g3", "g4", "g5", "g6"].map((slug) => page(slug)),
    ];
    const picked = pickCompareSiblings(pages, "lib-a", 4);
    expect(picked.map((p) => p.category)).toEqual([
      "library",
      "generator",
      "generator",
      "generator",
    ]);
    // The other library page starts its fill further along.
    const a = picked.slice(1).map((p) => p.slug);
    const b = pickCompareSiblings(pages, "lib-b", 4)
      .slice(1)
      .map((p) => p.slug);
    expect(a).toEqual(["g1", "g2", "g3"]);
    expect(b).toEqual(["g4", "g5", "g6"]);
  });

  it("falls back to the first pages for an unknown slug", () => {
    const pages = ["b", "a", "c"].map((slug) => page(slug));
    expect(pickCompareSiblings(pages, "zzz", 2).map((p) => p.slug)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("compare pages' sibling links", () => {
  it("reads the compare frontmatter", () => {
    expect(realPages.length).toBeGreaterThan(SHOWN);
    for (const p of realPages) expect(p.name).not.toBe("");
  });

  it("gives every comparison sibling links, and none more than its share", () => {
    const inlinks = new Map(realPages.map((p) => [p.slug, 0]));
    for (const current of realPages) {
      const picked = pickCompareSiblings(realPages, current.slug, SHOWN);
      expect(picked).toHaveLength(SHOWN);
      expect(picked.map((p) => p.slug)).not.toContain(current.slug);
      for (const p of picked)
        inlinks.set(p.slug, (inlinks.get(p.slug) ?? 0) + 1);
    }
    // Before the rotation 13 generator pages got 0 and a few got 22-24. A
    // kind with fewer pages than SHOWN (the libraries) links all of its own.
    for (const kind of new Set(realPages.map((p) => p.category))) {
      const ofKind = realPages.filter((p) => p.category === kind);
      const counts = ofKind.map((p) => inlinks.get(p.slug) ?? 0);
      const floor = Math.min(SHOWN, ofKind.length - 1);
      expect(Math.min(...counts), kind).toBeGreaterThanOrEqual(floor);
      expect(Math.max(...counts), kind).toBeLessThanOrEqual(SHOWN + 2);
    }
  });
});
