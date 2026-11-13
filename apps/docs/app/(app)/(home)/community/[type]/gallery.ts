import "server-only";

import { unstable_cache } from "next/cache";
import { OFFICIAL_FRAME_COLLECTIONS } from "qrdx";
import { findOfficialFrame } from "@/lib/community/catalog";
import { listFrames, listItems } from "@/lib/community/queries";
import { COMMUNITY_TAG } from "@/lib/community/store";
import {
  type CommunityItemCard,
  type CommunityItemType,
  TYPE_SEGMENTS,
} from "@/lib/community/types";
import { viewerId } from "@/lib/community/viewer";

// One community gallery (/community/frames, /templates, /collections,
// /kits): what its filters, sort, group and tag show. Shared by the page,
// which draws the first page, and the server action that loads the pages
// after it as someone scrolls (./actions.tsx).

export type GalleryType = Exclude<CommunityItemType, "theme">;
export type Filter = "all" | "official" | "community" | "mine" | "saved";
export type Sort = "popular" | "newest" | "oldest";

export const FILTERS = [
  "all",
  "official",
  "community",
  "mine",
  "saved",
] as const satisfies readonly Filter[];

export interface GalleryQuery {
  type: GalleryType;
  filter: Filter;
  sort: Sort;
  /** An official frame collection (frames only) */
  group: string | null;
  /** A tag (not frames: theirs are one-offs, they have groups) */
  tag: string | null;
}

const GALLERY_TYPES = [
  "frame",
  "collection",
  "page-template",
  "kit",
] as const satisfies readonly GalleryType[];

const first = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] : value;

/**
 * The query in a gallery's search parameters (or a request's), with
 * anything unknown dropped: the page reads the URL, the server action the
 * values the browser sends back.
 */
export function parseGalleryQuery(
  type: unknown,
  params: Record<string, unknown>,
): GalleryQuery | null {
  const galleryType = GALLERY_TYPES.find((item) => item === type);
  if (!galleryType) return null;
  const from = first(params.from);
  const sortParam = first(params.sort);
  const groupParam = first(params.group);
  const tagParam = first(params.tag);
  const group =
    galleryType === "frame"
      ? (OFFICIAL_FRAME_COLLECTIONS.find((item) => item.id === groupParam)
          ?.id ?? null)
      : null;
  const tag =
    galleryType !== "frame" &&
    typeof tagParam === "string" &&
    tagParam.length > 0 &&
    tagParam.length <= 64
      ? tagParam
      : null;
  return {
    type: galleryType,
    filter: FILTERS.find((option) => option === from) ?? "all",
    sort:
      sortParam === "newest" || sortParam === "oldest" ? sortParam : "popular",
    group,
    tag,
  };
}

/**
 * Cards per page. Page templates and kits draw a page preview each (tens
 * of kilobytes), so their pages are shorter: two rows.
 */
export const galleryPerPage = (type: GalleryType): number =>
  type === "page-template" || type === "kit" ? 6 : 24;

/** Groups hold official frames only. */
export const groupsApply = (query: GalleryQuery) =>
  query.type === "frame" &&
  (query.filter === "all" || query.filter === "official");

/** The group a card belongs to (official frames only). */
export const groupOf = (card: CommunityItemCard) =>
  card.isOfficial ? findOfficialFrame(card.slug)?.collection : undefined;

/** The gallery's link with some of its query changed (a new filter starts at page 1). */
export function galleryHref(
  query: GalleryQuery,
  next: Partial<Omit<GalleryQuery, "type"> & { page: number }> = {},
): string {
  const params = new URLSearchParams();
  const from = next.filter ?? query.filter;
  const sort = next.sort ?? query.sort;
  const group =
    next.group === undefined
      ? groupsApply(query)
        ? query.group
        : null
      : next.group;
  const tag = next.tag === undefined ? query.tag : next.tag;
  const page = next.page ?? 1;
  if (from !== "all") params.set("from", from);
  if (sort !== "popular") params.set("sort", sort);
  if (group && (from === "all" || from === "official")) {
    params.set("group", group);
  }
  if (tag) params.set("tag", tag);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  const base = `/community/${TYPE_SEGMENTS[query.type]}`;
  return search ? `${base}?${search}` : base;
}

/** Names the list a query shows, for the infinite list's restore on Back. */
export const galleryListKey = (query: GalleryQuery) =>
  galleryHref(query).replace("/community/", "community:");

export interface GalleryCards {
  /** Every card of the type and filter, before the group and tag */
  cards: CommunityItemCard[];
  /** The cards the gallery shows, in order */
  shown: CommunityItemCard[];
  /** The visitor, for "mine" and "saved" */
  userId: string | null;
}

async function listCards(
  type: GalleryType,
  filter: Filter,
  sort: Sort,
  userId: string | null,
): Promise<CommunityItemCard[]> {
  const official =
    filter === "official" ? true : filter === "community" ? false : undefined;
  const createdBy = filter === "mine" ? (userId ?? undefined) : undefined;
  const savedBy = filter === "saved" ? (userId ?? undefined) : undefined;
  return type === "frame"
    ? await listFrames({ official, sort, createdBy, savedBy })
    : await listItems({ type, official, sort, createdBy, savedBy, limit: 200 });
}

/**
 * A gallery's list for everyone (not "mine" or "saved"), cached for a
 * minute like the overview's (lib/community/home.ts): the page and each
 * page the list loads after it read the same list, not one query each.
 */
const publicCards = unstable_cache(
  (type: GalleryType, filter: Filter, sort: Sort) =>
    listCards(type, filter, sort, null),
  ["community-gallery"],
  { revalidate: 60, tags: [COMMUNITY_TAG] },
);

export async function galleryCards(query: GalleryQuery): Promise<GalleryCards> {
  const personal = query.filter === "mine" || query.filter === "saved";
  const userId = personal ? await viewerId() : null;
  const cards = personal
    ? userId
      ? await listCards(query.type, query.filter, query.sort, userId)
      : []
    : await publicCards(query.type, query.filter, query.sort);
  const activeGroup = groupsApply(query) ? query.group : null;
  const shown = cards.filter(
    (card) =>
      (!activeGroup || groupOf(card) === activeGroup) &&
      (!query.tag || card.tags.includes(query.tag)),
  );
  return { cards, shown, userId };
}
