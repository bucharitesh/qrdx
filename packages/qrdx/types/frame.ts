import { z } from "zod";
import {
  FRAME_FONT_SCALE_MAX,
  FRAME_FONT_SCALE_MIN,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
} from "./constants";

export {
  DEFAULT_FRAME_TEXT,
  FRAME_FONT_SCALE_MAX,
  FRAME_FONT_SCALE_MIN,
  FRAME_STYLES,
  FRAME_TEXT_MAX_LENGTH,
} from "./constants";

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
