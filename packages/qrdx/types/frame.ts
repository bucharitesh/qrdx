import { z } from "zod";

export const FRAME_STYLES = [
  "none",
  "banner-bottom",
  "banner-top",
  "border",
  "rounded-border",
  "speech-bubble",
  // Added after 0.0.46
  "banner-top-bottom",
  "speech-bubble-top",
  "chat-bubble",
  "circle",
  "polaroid",
  "phone",
  "ticket",
  "badge",
  "envelope",
  "tag",
  "menu-card",
  "sticker",
  "gradient-border",
  "focus",
] as const;

/** Longest call-to-action label a frame renders. */
export const FRAME_TEXT_MAX_LENGTH = 24;

/** Label used when a frame has no `text`. Pass `""` to hide the label. */
export const DEFAULT_FRAME_TEXT = "Scan me";

/** Smallest and largest `fontScale` (label size relative to the default). */
export const FRAME_FONT_SCALE_MIN = 0.5;
export const FRAME_FONT_SCALE_MAX = 1.5;

// Zod schemas
export const frameStyleSchema = z.enum(FRAME_STYLES);

export const frameSchema = z.object({
  style: frameStyleSchema,
  text: z.string().max(FRAME_TEXT_MAX_LENGTH).optional(),
  color: z.string().optional(),
  textColor: z.string().optional(),
  /**
   * Second label: the bottom band of "banner-top-bottom", the lower arc of
   * "circle" and the footer of "menu-card". Other styles ignore it.
   */
  secondaryText: z.string().max(FRAME_TEXT_MAX_LENGTH).optional(),
  /** End color of "gradient-border" (the gradient runs from `color`). */
  secondaryColor: z.string().optional(),
  /** Label size relative to the default, 0.5 to 1.5 (labels still fit). */
  fontScale: z
    .number()
    .min(FRAME_FONT_SCALE_MIN)
    .max(FRAME_FONT_SCALE_MAX)
    .optional(),
});

// Inferred types
export type FrameStyle = z.infer<typeof frameStyleSchema>;

/**
 * Call-to-action frame drawn around the QR code. The frame adds space around
 * the code, so the QR modules and quiet zone are never covered.
 */
export type QRFrame = z.infer<typeof frameSchema>;
