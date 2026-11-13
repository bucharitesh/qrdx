"use server";

import type { ReactNode } from "react";
import {
  cardKey,
  ItemCard,
  ItemRowCards,
} from "@/components/community/item-card";
import type { InfinitePage } from "@/components/infinite/infinite-list";
import { ShowcaseWall } from "@/components/showcase/showcase-wall";
import { type CommunityHome, getCommunityHome } from "@/lib/community/home";
import { findWallChunk } from "@/lib/landing/showcase-wall";
import { MAX_PAGE, pageSlice } from "@/lib/paging";
import {
  galleryCards,
  galleryPerPage,
  parseGalleryQuery,
} from "./[type]/gallery";

// What the community pages load as someone scrolls. Public and read-only:
// the same queries the pages run (cached), never a write.
//
// The overview (components/community/deferred-community.tsx): the "Made
// with QRdx" wall's later rows and the rows of cards under it.
//
// A gallery (/community/frames and the others): its next page of cards
// (components/infinite/infinite-list.tsx), with the same filters.

/**
 * One page of a gallery's cards, for its filters as the page's URL has them
 * (`params`: from, sort, group, tag). Out-of-range pages come back empty.
 */
export async function loadCommunityGalleryPage(
  type: string,
  params: Record<string, string>,
  page: number,
): Promise<InfinitePage> {
  const query = parseGalleryQuery(
    type,
    params && typeof params === "object" ? params : {},
  );
  if (!(query && Number.isInteger(page) && page > 1 && page <= MAX_PAGE)) {
    return { items: [], nextPage: null };
  }
  const { shown } = await galleryCards(query);
  const perPage = galleryPerPage(query.type);
  if ((page - 1) * perPage >= shown.length) {
    return { items: [], nextPage: null };
  }
  const slice = pageSlice(shown, page, perPage);
  return {
    items: slice.items.map((card) => ({
      key: cardKey(card),
      node: <ItemCard card={card} />,
    })),
    nextPage: slice.nextPage,
  };
}

const ROWS = [
  "official",
  "featured",
  "collections",
  "themes",
  "fresh",
  "templates",
] as const satisfies readonly (keyof CommunityHome)[];

type RowName = (typeof ROWS)[number];

const isRow = (name: string): name is RowName =>
  (ROWS as readonly string[]).includes(name);

/** Most chunks one request may ask for. */
const MAX_KEYS = 64;

/**
 * Chunks by key: "wall:<band>:<index>" is a chunk of the wall's rows,
 * "row:<name>" a row of cards. Keys that name nothing are left out.
 */
export async function loadCommunityChunks(
  keys: string[],
): Promise<Record<string, ReactNode>> {
  if (!Array.isArray(keys)) return {};
  const wanted = [
    ...new Set(keys.filter((key) => typeof key === "string")),
  ].slice(0, MAX_KEYS);
  const chunks: Record<string, ReactNode> = {};
  let home: CommunityHome | undefined;
  for (const key of wanted) {
    if (key.startsWith("wall:")) {
      const rows = findWallChunk(key.slice("wall:".length));
      if (rows) chunks[key] = <ShowcaseWall rows={rows} />;
    } else if (key.startsWith("row:")) {
      const name = key.slice("row:".length);
      if (!isRow(name)) continue;
      home ??= await getCommunityHome();
      const cards = home[name];
      if (cards.length > 0) chunks[key] = <ItemRowCards cards={cards} />;
    }
  }
  return chunks;
}
