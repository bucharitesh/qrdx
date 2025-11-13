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
export const qrStyleSchema = z.object({
  value: z.string().describe("The URL or text to encode in the QR code"),
  size: z.number().optional().describe("Size of the QR code in pixels"),
  bgColor: z.string().describe("Background color of the QR code"),
  fgColor: z.string().describe("Foreground (main) color of the QR code"),
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

export type QRStyle = z.infer<typeof qrStyleSchema>;

/**
 * QR Code Preset Configuration
 */
export const qrPresetSchema = z.object({
  id: z.string(),
  name: z.string().describe("Display name for the preset"),
  description: z
    .string()
    .optional()
    .describe("Description of the preset style"),
  source: z.enum(["SAVED", "BUILT_IN"]).optional(),
  createdAt: z.string().optional(),
  style: qrStyleSchema.partial(),
});

export type QRPreset = z.infer<typeof qrPresetSchema>;

/**
 * QR Code Editor Preview Props
 */
export interface QREditorPreviewProps {
  style: Partial<QRStyle>;
  value: string;
}

/**
 * QR Code Editor Controls Props
 */
export interface QREditorControlsProps {
  style: Partial<QRStyle>;
  onChange: (style: Partial<QRStyle>) => void;
  presets?: QRPreset[];
}

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
