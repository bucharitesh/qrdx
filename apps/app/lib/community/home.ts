import "server-only";

import { unstable_cache } from "next/cache";
import type { ThemeStyles } from "@/types/theme";
import { legacyThemeCards, listFrames, listItems } from "./queries";
import { checkScanGate, type ScanGate } from "./scan-gate";
import { COMMUNITY_TAG, communityState } from "./store";
import type { CommunityItemCard } from "./types";

export interface CommunityHome {
  official: CommunityItemCard[];
  featured: CommunityItemCard[];
  collections: CommunityItemCard[];
  themes: CommunityItemCard[];
  fresh: CommunityItemCard[];
  templates: CommunityItemCard[];
}

async function loadHome(): Promise<CommunityHome> {
  const state = await communityState();
  const [
    official,
    featuredFrames,
    featuredThemes,
    collections,
    themes,
    fresh,
    templates,
  ] = await Promise.all([
    listFrames({ official: true }),
    listItems({ type: "frame", featured: true, limit: 4 }),
    listItems({ type: "theme", featured: true, limit: 4 }),
    listItems({ type: "collection", limit: 8 }),
    state.themes === "items"
      ? listItems({ type: "theme", sort: "popular", limit: 8 })
      : legacyThemeCards(8),
    listItems({ type: "frame", official: false, sort: "newest", limit: 8 }),
    listItems({ type: "page-template", sort: "newest", limit: 8 }),
  ]);
  return {
    official: official.slice(0, 8),
    featured: [...featuredFrames, ...featuredThemes].slice(0, 8),
    collections,
    themes,
    fresh,
    templates,
  };
}

/** Everything the /community overview shows (cached for a minute). */
export const getCommunityHome = unstable_cache(loadHome, ["community-home"], {
  revalidate: 60,
  tags: [COMMUNITY_TAG, "community-themes"],
});

/** Whether any collection is published (for the Collections tab). */
export const hasCollections = unstable_cache(
  async () => (await listItems({ type: "collection", limit: 1 })).length > 0,
  ["community-has-collections"],
  { revalidate: 60, tags: [COMMUNITY_TAG] },
);

/** Whether any page template is published (for the Templates tab). */
export const hasTemplates = unstable_cache(
  async () => (await listItems({ type: "page-template", limit: 1 })).length > 0,
  ["community-has-templates"],
  { revalidate: 60, tags: [COMMUNITY_TAG] },
);

/** Whether any kit is published (for the Kits tab). */
export const hasKits = unstable_cache(
  async () => (await listItems({ type: "kit", limit: 1 })).length > 0,
  ["community-has-kits"],
  { revalidate: 60, tags: [COMMUNITY_TAG] },
);

/**
 * The scan gate for an item page. Published versions never change, so the
 * result for a design is cached for good (the design is the cache key).
 */
export const itemScanGate = unstable_cache(
  async (styleJson: string): Promise<ScanGate> =>
    checkScanGate(JSON.parse(styleJson) as ThemeStyles),
  ["community-item-scan"],
  { revalidate: false },
);
