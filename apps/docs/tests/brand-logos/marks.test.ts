// The brand marks the UI ships (lib/brand-logos/marks.generated.ts) match
// the pinned simple-icons release, and every slug the app names exists.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as simpleIcons from "simple-icons";
import { describe, expect, it } from "vitest";
import { CONTENT_TYPE_BRANDS } from "@/lib/brand-logos/content-types";
import {
  BRAND_LOGO_COUNT,
  BRAND_MARKS,
  SIMPLE_ICONS_VERSION,
} from "@/lib/brand-logos/marks.generated";
import {
  POPULAR_BRAND_GROUPS,
  POPULAR_BRAND_SLUGS,
} from "@/lib/brand-logos/popular";
import { brandIndex, getBrandIcon } from "@/lib/brand-logos/server";
import { UI_SLUGS } from "../../scripts/brand-logos/generate-marks.mjs";

const require = createRequire(import.meta.url);
const installed = JSON.parse(
  readFileSync(
    join(dirname(require.resolve("simple-icons")), "package.json"),
    "utf8",
  ),
).version as string;
const all = Object.values(simpleIcons);

describe("generated brand marks", () => {
  it("come from the installed simple-icons", () => {
    expect(SIMPLE_ICONS_VERSION).toBe(installed);
    expect(BRAND_LOGO_COUNT).toBe(all.length);
  });

  it("match simple-icons exactly (run scripts/brand-logos/generate-marks.mjs)", () => {
    expect(Object.keys(BRAND_MARKS).sort()).toEqual([...UI_SLUGS].sort());
    for (const [slug, mark] of Object.entries(BRAND_MARKS)) {
      const icon = getBrandIcon(slug);
      expect(icon, slug).not.toBeNull();
      expect(mark).toEqual({
        title: icon?.title,
        hex: icon?.hex,
        path: icon?.path,
      });
    }
  });

  it("cover every content type that names a brand", () => {
    for (const slug of Object.values(CONTENT_TYPE_BRANDS)) {
      expect(BRAND_MARKS).toHaveProperty(slug);
    }
  });
});

describe("gallery catalogue", () => {
  it("lists popular brands that all exist, once each", () => {
    for (const slug of POPULAR_BRAND_SLUGS) {
      expect(getBrandIcon(slug), slug).not.toBeNull();
    }
    expect(new Set(POPULAR_BRAND_SLUGS).size).toBe(POPULAR_BRAND_SLUGS.length);
    expect(POPULAR_BRAND_GROUPS.map((group) => group.id)).toEqual([
      "social",
      "messaging",
      "payments",
      "maps",
      "music",
      "video",
      "stores",
      "reviews",
    ]);
  });

  it("indexes every brand with its name, color and aliases", () => {
    const index = brandIndex();
    expect(index).toHaveLength(all.length);
    const x = index.find(([slug]) => slug === "x");
    expect(x?.[1]).toBe("X");
    expect(x?.[2]).toMatch(/^[0-9A-F]{6}$/);
    expect(x?.[3]).toContain("Twitter");
  });

  it("doesn't bring back brands removed at their owners' request", () => {
    for (const slug of ["linkedin", "amazon", "slack", "microsoft"]) {
      expect(getBrandIcon(slug), slug).toBeNull();
    }
  });
});
