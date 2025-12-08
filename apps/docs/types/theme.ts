import type { qrPreset } from "@repo/database";
import type { InferSelectModel } from "drizzle-orm";
import {
  bodyPatternSchema,
  cornerEyeDotPatternSchema,
  cornerEyePatternSchema,
  errorLevelSchema,
} from "qrdx/types";
import { z } from "zod";

/**
 * QR Code Style Configuration Schema
 */
export const themeStylePropsSchema = z.object({
  size: z.number().optional().describe("Size of the QR code in pixels"),
  bgColor: z.string().optional().describe("Background color of the QR code"),
  fgColor: z
    .string()
    .optional()
    .describe("Foreground (main) color of the QR code"),
  eyeColor: z.string().optional().describe("Color of the corner eye patterns"),
  dotColor: z.string().optional().describe("Color of the inner eye dots"),
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
  margin: z.number().optional().describe("Margin around the QR code"),
  templateId: z.string().optional().describe("Template/frame ID to use"),
  showLogo: z.boolean().optional().describe("Whether to show a logo in center"),
  customLogo: z
    .string()
    .optional()
    .describe("Custom logo image URL or data URI"),
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

export type ThemePreset = {
  source?: "SAVED" | "BUILT_IN";
  createdAt?: string;
  label?: string;
  styles: ThemeStyles;
};

// Type alias for backward compatibility
export type QRPreset = ThemePreset;
export type QRStyle = ThemeStyles;

export type Theme = InferSelectModel<typeof qrPreset>;

/**
 * Download Format Options
 */
export const downloadFormatSchema = z.enum(["png", "jpg", "svg"]);
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
});

export type DownloadOptions = z.infer<typeof downloadOptionsSchema>;
