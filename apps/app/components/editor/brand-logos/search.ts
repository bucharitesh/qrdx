// Searching the brand logo gallery by name, slug and alias (former names,
// translations, other spellings), so "twitter" finds X and "google maps"
// finds Google Maps.

import { POPULAR_BRAND_SLUGS } from "@/lib/brand-logos/popular";

/** A brand as /api/brand-logos lists it: [slug, name, hex, aliases?]. */
export type BrandIndexRow =
  | [slug: string, title: string, hex: string]
  | [slug: string, title: string, hex: string, aliases: string[]];

export interface BrandEntry {
  slug: string;
  title: string;
  hex: string;
  /** Normalized name, slug and aliases, for matching */
  keys: string[];
}

/** Lowercase, accents and punctuation dropped: "Café 24/7" → "cafe247". */
export const normalize = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]/g, "");

export function toBrandEntry([
  slug,
  title,
  hex,
  aliases,
]: BrandIndexRow): BrandEntry {
  const keys = new Set([normalize(title), slug]);
  for (const alias of aliases ?? []) keys.add(normalize(alias));
  keys.delete("");
  return { slug, title, hex, keys: [...keys] };
}

const POPULAR_RANK = new Map(
  POPULAR_BRAND_SLUGS.map((slug, rank) => [slug, rank]),
);

/**
 * Brands matching `query`, best first: an exact name, then names starting
 * with it, then names containing it; popular brands first within each.
 */
export function rankBrands(brands: BrandEntry[], query: string): BrandEntry[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: { entry: BrandEntry; score: number }[] = [];
  for (const entry of brands) {
    let score = 0;
    for (const key of entry.keys) {
      if (key === q) score = Math.max(score, 3);
      else if (key.startsWith(q)) score = Math.max(score, 2);
      else if (key.includes(q)) score = Math.max(score, 1);
    }
    if (score > 0) scored.push({ entry, score });
  }
  const popular = (entry: BrandEntry) =>
    POPULAR_RANK.get(entry.slug) ?? Number.POSITIVE_INFINITY;
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        popular(a.entry) - popular(b.entry) ||
        a.entry.title.localeCompare(b.entry.title),
    )
    .map(({ entry }) => entry);
}
