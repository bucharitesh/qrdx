// What each item type stores (community_item.payload and every version),
// validated on the server before anything is written. Safe to import
// anywhere: no database, no Node APIs.
import { OFFICIAL_FRAMES } from "qrdx";
import { customFrameSchema, type QRCustomFrame } from "qrdx/types";
import { z } from "zod";
import {
  CLASSIC_STYLE,
  LOGO_ICON_IDS,
  toThemeStyles,
} from "@/lib/qr-design/style";
import { type ThemeStyles, themeStylePropsSchema } from "@/types/theme";
import { toPublishableStyle } from "./public-style";

export const NAME_MAX_LENGTH = 60;
export const DESCRIPTION_MAX_LENGTH = 500;
export const MAX_ITEM_TAGS = 5;
export const COLLECTION_MAX_ITEMS = 48;

/** A theme: the design without images, quick logo icons by id. */
export const themePayloadSchema = z
  .object({
    style: themeStylePropsSchema,
    logoIcon: z.enum(LOGO_ICON_IDS).optional(),
  })
  .strict();
export type ThemePayload = z.infer<typeof themePayloadSchema>;

/** A frame: a frame spec with its labels and colors. */
export const framePayloadSchema = z
  .object({ frame: customFrameSchema })
  .strict();
export type FramePayload = z.infer<typeof framePayloadSchema>;

/** A collection: published items, in order. */
export const collectionPayloadSchema = z
  .object({
    items: z.array(z.string().min(1).max(64)).min(1).max(COLLECTION_MAX_ITEMS),
  })
  .strict();
export type CollectionPayload = z.infer<typeof collectionPayloadSchema>;

/**
 * The theme payload for a saved style: no uploaded logo or image art (see
 * ./public-style.ts), unknown keys dropped. Null when the style isn't valid.
 */
export function themePayloadFromStyle(style: ThemeStyles): {
  payload: ThemePayload;
  removed: ReturnType<typeof toPublishableStyle>["removed"];
} | null {
  const clean = toPublishableStyle(style);
  const parsed = themeStylePropsSchema.safeParse(clean.style);
  if (!parsed.success) return null;
  const { customLogo: _logo, art: _art, ...rest } = parsed.data;
  const payload: ThemePayload = {
    style: rest,
    ...(clean.logoIcon ? { logoIcon: clean.logoIcon } : {}),
  };
  return { payload, removed: clean.removed };
}

/** JSON with sorted keys, so equal payloads hash the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The plain code frames are previewed and scored on. */
export const FRAME_BASE_STYLE: ThemeStyles = toThemeStyles(CLASSIC_STYLE);

export const framePreviewStyle = (frame: QRCustomFrame): ThemeStyles => ({
  ...FRAME_BASE_STYLE,
  frame,
});

/** Tags a frame can carry: the official catalogue's, plus looks. */
export const FRAME_TAGS: string[] = [
  ...new Set([
    ...OFFICIAL_FRAMES.flatMap((frame) => frame.tags),
    "minimal",
    "bold",
    "playful",
    "elegant",
    "dark",
    "light",
    "print",
  ]),
].sort();
