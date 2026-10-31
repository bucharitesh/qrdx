import { z } from "zod";

export const FRAME_STYLES = [
  "none",
  "banner-bottom",
  "banner-top",
  "border",
  "rounded-border",
  "speech-bubble",
] as const;

/** Longest call-to-action label a frame renders. */
export const FRAME_TEXT_MAX_LENGTH = 24;

/** Label used when a frame has no `text`. Pass `""` to hide the label. */
export const DEFAULT_FRAME_TEXT = "Scan me";

// Zod schemas
export const frameStyleSchema = z.enum(FRAME_STYLES);

export const frameSchema = z.object({
  style: frameStyleSchema,
  text: z.string().max(FRAME_TEXT_MAX_LENGTH).optional(),
  color: z.string().optional(),
  textColor: z.string().optional(),
});

// Inferred types
export type FrameStyle = z.infer<typeof frameStyleSchema>;

/**
 * Call-to-action frame drawn around the QR code. The frame adds space around
 * the code, so the QR modules and quiet zone are never covered.
 */
export type QRFrame = z.infer<typeof frameSchema>;
