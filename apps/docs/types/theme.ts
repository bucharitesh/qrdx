import type { qrPreset } from "@repo/database";
import type { InferSelectModel } from "drizzle-orm";
import {
  anyFrameSchema,
  bodyPatternSchema,
  cornerEyeDotPatternSchema,
  cornerEyePatternSchema,
  errorLevelSchema,
  logoOptionsSchema,
  MODULE_SCALE_MAX,
  MODULE_SCALE_MIN,
  qrArtSchema,
  qrShapeSchema,
} from "qrdx/types";
import { z } from "zod";
import {
  savedColorConfigSchema,
  savedEyeColorsSchema,
} from "@/lib/paint/saved-paint";

/**
 * QR Code Style Configuration Schema
 */
export const themeStylePropsSchema = z.object({
  size: z
    .number()
    .positive()
    .optional()
    .describe("Size of the QR code in pixels"),
  bgColor: savedColorConfigSchema
    .optional()
    .describe(
      "Background color of the QR code - supports solid colors, gradients and image fills (a data:image URL, never a link)",
    ),
  fgColor: savedColorConfigSchema
    .optional()
    .describe(
      "Foreground (main) color of the QR code - supports solid colors, gradients and image fills (a data:image URL, never a link)",
    ),
  eyeColor: savedColorConfigSchema
    .optional()
    .describe(
      "Color of the corner eye patterns - supports solid colors, gradients and image fills (a data:image URL, never a link)",
    ),
  dotColor: savedColorConfigSchema
    .optional()
    .describe(
      "Color of the corner eye dots - supports solid colors, gradients and image fills (a data:image URL, never a link)",
    ),
  bodyPattern: bodyPatternSchema
    .optional()
    .describe("Pattern style for the QR code body"),
  cornerEyePattern: cornerEyePatternSchema
    .optional()
    .describe("Pattern style for the corner eyes"),
  cornerEyeDotPattern: cornerEyeDotPatternSchema
    .optional()
    .describe("Pattern style for the corner eye dots"),
  level: errorLevelSchema
    .optional()
    .describe("Error correction level (L, M, Q, H)"),
  margin: z
    .number()
    .min(0)
    .optional()
    .describe("Margin (quiet zone) around the QR code, in modules"),
  templateId: z.string().optional().describe("Template/frame ID to use"),
  frame: anyFrameSchema
    .optional()
    .describe(
      "Call-to-action frame around the QR code, e.g. a 'Scan me' banner (text up to 24 characters), or a custom frame drawn from a frame spec (style 'custom')",
    ),
  showLogo: z.boolean().optional().describe("Whether to show a logo in center"),
  customLogo: z
    .string()
    .optional()
    .describe("Custom logo image URL or data URI"),
  art: qrArtSchema
    .optional()
    .describe("Logo QR or Image QR (halftone) art built from an image"),
  eyeColors: savedEyeColorsSchema
    .optional()
    .describe(
      "Per-eye colors (topLeft, topRight, bottomLeft), each with an outer frame and inner dot color that override eyeColor and dotColor",
    ),
  moduleScale: z
    .number()
    .min(MODULE_SCALE_MIN)
    .max(MODULE_SCALE_MAX)
    .optional()
    .describe("Size of each data module, 0.5 to 1 (default 1)"),
  autoLevel: z
    .boolean()
    .optional()
    .describe(
      "Raise error correction to H when the logo covers more than 7% of the code",
    ),
  shape: qrShapeSchema
    .optional()
    .describe(
      "Outline of the code: square (default) or circle, which puts the code in a disc of decorative dots",
    ),
  logoOptions: logoOptionsSchema
    .optional()
    .describe(
      "Logo size (share of the code width), clear space in modules and position (0 to 1 across the code)",
    ),
});

export type ThemeStyles = z.infer<typeof themeStylePropsSchema>;

export interface ThemeEditorPreviewProps {
  styles: ThemeStyles;
}

export interface ThemeEditorControlsProps {
  styles: ThemeStyles;
  currentMode: "light" | "dark";
  onChange: (styles: ThemeStyles) => void;
  themePromise: Promise<Theme | null>;
}

/** Shelf a built-in theme sits on in the theme gallery. */
export type ThemeCategory =
  | "essentials"
  | "brand"
  | "pastel"
  | "bold"
  | "dark"
  | "gradient"
  | "elegant"
  | "playful"
  | "industry"
  | "seasonal";

export type ThemePreset = {
  source?: "SAVED" | "BUILT_IN";
  createdAt?: string;
  label?: string;
  styles: ThemeStyles;
  /** Built-in themes only: gallery shelf */
  category?: ThemeCategory;
  /** Built-in themes only: extra search words */
  tags?: string[];
};

// Type alias for backward compatibility
export type QRPreset = ThemePreset;
export type QRStyle = ThemeStyles;

export type Theme = InferSelectModel<typeof qrPreset>;

/**
 * Download Format Options
 */
export const downloadFormatSchema = z.enum(["png", "jpg", "svg", "pdf", "eps"]);
export type DownloadFormat = z.infer<typeof downloadFormatSchema>;

/**
 * Download Size Preset
 */
export const downloadSizePresetSchema = z.enum([
  "small",
  "medium",
  "large",
  "xlarge",
  "2xl",
  "3xl",
  "custom",
]);
export type DownloadSizePreset = z.infer<typeof downloadSizePresetSchema>;

/**
 * Download Size Options
 */
export const downloadSizeSchema = z.object({
  width: z.number().min(50).max(5000),
  height: z.number().min(50).max(5000),
});

export type DownloadSize = z.infer<typeof downloadSizeSchema>;

/**
 * Download Options for UI
 */
export const downloadOptionsSchema = z.object({
  format: downloadFormatSchema,
  sizePreset: downloadSizePresetSchema,
  width: z.number(),
  height: z.number(),
  filename: z.string().optional(),
  multiplier: z.number().default(1), // new Field
  transparent: z.boolean().default(false), // new Field
});

export type DownloadOptions = z.infer<typeof downloadOptionsSchema>;
