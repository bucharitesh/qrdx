// The gallery's search over the real index: names, slugs and aliases.
import { describe, expect, it } from "vitest";
import {
  normalize,
  rankBrands,
  toBrandEntry,
} from "@/components/editor/brand-logos/search";
import { brandIndex } from "@/lib/brand-logos/server";

const brands = brandIndex().map(toBrandEntry);
const top = (query: string) => rankBrands(brands, query)[0]?.slug;

describe("brand search", () => {
  it("finds brands by name, slug and alias", () => {
    expect(top("spotify")).toBe("spotify");
    expect(top("Google Maps")).toBe("googlemaps");
    expect(top("twitter")).toBe("x");
    expect(top("cash app")).toBe("cashapp");
  });

  it("puts popular brands first among equal matches", () => {
    const results = rankBrands(brands, "goo").map((brand) => brand.slug);
    expect(results.indexOf("google")).toBeLessThan(
      results.indexOf("goodreads"),
    );
  });

  it("ignores case, accents and punctuation", () => {
    expect(normalize("Café 24/7 & Co")).toBe("cafe247andco");
    expect(rankBrands(brands, "  ")).toEqual([]);
  });
});
