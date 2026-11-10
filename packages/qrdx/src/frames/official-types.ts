// Types for the official frame catalogue, kept apart from the frame data so
// the light index (catalogue/index.ts) needs none of it.
import type { FrameSpec } from "../../types/frame-spec";

/** Ids of the groups the official frames come in (see OFFICIAL_FRAME_COLLECTIONS). */
export type OfficialFrameCollection =
  | "call-to-action"
  | "holidays"
  | "seasons"
  | "food-drink"
  | "shopping"
  | "events"
  | "places"
  | "health-learning"
  | "business";

export interface OfficialFrame {
  /** Stable id (also the file name). Never renamed or reused. */
  id: string;
  name: string;
  description: string;
  /** "seasonal" for holidays and seasons, "use-case" for the rest */
  category: "use-case" | "seasonal";
  collection: OfficialFrameCollection;
  /**
   * The holiday or season a seasonal frame is for, such as "diwali",
   * "christmas" or "summer", so a picker can show it when it comes round.
   */
  occasion?: string;
  /** QRdx content types the frame suits (empty: any) */
  contentTypes: string[];
  tags: string[];
  license: "CC0-1.0";
  spec: FrameSpec;
}

/** An official frame without its spec (OFFICIAL_FRAME_INDEX). */
export interface OfficialFrameIndexEntry {
  id: string;
  name: string;
  collection: OfficialFrameCollection;
  occasion?: string;
  tags: string[];
  /** frameSpecHash(spec): tells an unchanged copy of this frame's spec */
  hash: string;
  /** Artboard width ÷ height, to size a preview before the spec loads */
  ratio: number;
}
