// What the community pages show, shared by the server queries and the
// client components. Safe to import anywhere.
import type { ThemeStyles } from "@/types/theme";

export type CommunityItemType = "frame" | "theme" | "collection";

export const COMMUNITY_TYPES: CommunityItemType[] = [
  "frame",
  "theme",
  "collection",
];

/** URL segment of each type: /community/frames/<slug> */
export const TYPE_SEGMENTS: Record<CommunityItemType, string> = {
  frame: "frames",
  theme: "themes",
  collection: "collections",
};

export const TYPE_LABELS: Record<
  CommunityItemType,
  { one: string; many: string }
> = {
  frame: { one: "Frame", many: "Frames" },
  theme: { one: "Theme", many: "Themes" },
  collection: { one: "Collection", many: "Collections" },
};

export function typeFromSegment(segment: string): CommunityItemType | null {
  const entry = Object.entries(TYPE_SEGMENTS).find(([, s]) => s === segment);
  return entry ? (entry[0] as CommunityItemType) : null;
}

export const itemPath = (type: CommunityItemType, slug: string) =>
  `/community/${TYPE_SEGMENTS[type]}/${slug}`;

export interface CommunityCreator {
  /** null for the official catalogue before the seed runs */
  profileId: string | null;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  official: boolean;
  verified: boolean;
}

/** One card in a grid or row. */
export interface CommunityItemCard {
  /** null: an official frame read from the engine (not in the database yet) */
  id: string | null;
  type: CommunityItemType;
  slug: string;
  name: string;
  description: string | null;
  creator: CommunityCreator;
  isOfficial: boolean;
  version: number;
  likeCount: number;
  saveCount: number;
  useCount: number;
  tags: string[];
  publishedAt: string | null;
  /** The design to draw on the card (frames on a plain code) */
  preview: ThemeStyles;
  /** Collections: up to 3 designs from their items */
  stack?: ThemeStyles[];
  /** Collections: how many items they hold */
  itemCount?: number;
}

export interface CommunityItemDetail extends CommunityItemCard {
  /** What "Use in editor" applies: a theme's style, or { frame } */
  apply: ThemeStyles;
  /** Content types a frame suits (empty: any) */
  contentTypes: string[];
  scanScore: number | null;
  /** Collections: their items, in order */
  entries?: CommunityItemCard[];
  remixedFromLabel: string | null;
  isLikedByMe: boolean;
  isSavedByMe: boolean;
  /** The viewer published it (and may unpublish it) */
  isMine: boolean;
}

export interface CommunityProfileView {
  creator: CommunityCreator;
  bio: string | null;
  itemCount: number;
  likeCount: number;
  useCount: number;
  items: CommunityItemCard[];
}
