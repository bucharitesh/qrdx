import type { CSSProperties } from "react";
import { z } from "zod";
import { type QRArt, qrArtSchema } from "./art";
import { type ColorConfig, colorConfigSchema } from "./color";
import {
  type CornerEyeDotPattern,
  cornerEyeDotPatternSchema,
} from "./corner-dot";
import { type CornerEyePattern, cornerEyePatternSchema } from "./corner-eye";
import { frameSchema, type QRFrame } from "./frame";
import { type BodyPattern, bodyPatternSchema } from "./image-pattern";
import type { TemplateDefinition } from "./template";

// Zod schemas
export const imageSettingsSchema = z.object({
  src: z.string(),
  height: z.number(),
  width: z.number(),
  excavate: z.boolean(),
  x: z.number().optional(),
  y: z.number().optional(),
  /**
   * Extra clear space around the logo when `excavate` is on, in the same
   * pixels as `width` and `height` (default 0).
   */
  padding: z.number().min(0).optional(),
});

export const errorLevelSchema = z.enum(["L", "M", "Q", "H"]);

/** Smallest and largest `moduleScale` (size of each data module). */
export const MODULE_SCALE_MIN = 0.5;
export const MODULE_SCALE_MAX = 1;

/**
 * Share of the code a logo may cover before `autoLevel` raises error
 * correction to H (level L recovers about 7%).
 */
export const AUTO_LEVEL_LOGO_COVERAGE = 0.07;

/** The three finder patterns, for per-eye colors. */
export const EYE_POSITIONS = ["topLeft", "topRight", "bottomLeft"] as const;
export type EyePosition = (typeof EYE_POSITIONS)[number];

/** Colors of one eye: `outer` is the frame, `inner` the dot in it. */
export const eyeColorOverrideSchema = z.object({
  outer: colorConfigSchema.optional(),
  inner: colorConfigSchema.optional(),
});

/** Per-eye overrides of `eyeColor` (outer) and `dotColor` (inner). */
export const eyeColorsSchema = z.object({
  topLeft: eyeColorOverrideSchema.optional(),
  topRight: eyeColorOverrideSchema.optional(),
  bottomLeft: eyeColorOverrideSchema.optional(),
});

export const qrPropsSchema = z.object({
  value: z.string(),
  size: z.number().optional(),
  level: errorLevelSchema.optional(),
  bgColor: colorConfigSchema.optional(),
  fgColor: colorConfigSchema.optional(),
  eyeColor: colorConfigSchema.optional(),
  dotColor: colorConfigSchema.optional(),
  bodyPattern: bodyPatternSchema.optional(),
  cornerEyePattern: cornerEyePatternSchema.optional(),
  cornerEyeDotPattern: cornerEyeDotPatternSchema.optional(),
  margin: z.number().optional(),
  imageSettings: imageSettingsSchema.optional(),
  isOGContext: z.boolean().optional(),
  templateId: z.string().optional(),
  customProps: z.record(z.string(), z.any()).optional(),
  frame: frameSchema.optional(),
  art: qrArtSchema.optional(),
  eyeColors: eyeColorsSchema.optional(),
  moduleScale: z
    .number()
    .min(MODULE_SCALE_MIN)
    .max(MODULE_SCALE_MAX)
    .optional(),
  autoLevel: z.boolean().optional(),
});

// Inferred types
export type ImageSettings = z.infer<typeof imageSettingsSchema>;
export type ErrorLevel = z.infer<typeof errorLevelSchema>;
export type EyeColorOverride = z.infer<typeof eyeColorOverrideSchema>;
export type EyeColors = z.infer<typeof eyeColorsSchema>;

export interface QRProps {
  value: string;
  size?: number;
  level?: ErrorLevel;
  bgColor?: ColorConfig;
  fgColor?: ColorConfig;
  eyeColor?: ColorConfig;
  dotColor?: ColorConfig;
  bodyPattern?: BodyPattern;
  cornerEyePattern?: CornerEyePattern;
  cornerEyeDotPattern?: CornerEyeDotPattern;
  margin?: number;
  style?: CSSProperties;
  imageSettings?: ImageSettings;
  isOGContext?: boolean;
  templateId?: string;
  // Custom template definition - if provided, this will be used instead of looking up by templateId
  customTemplate?: TemplateDefinition<any>;
  // Generic custom props that can be used by any template
  // Each template can define its own custom props type (e.g., FlamQRProps)
  customProps?: Record<string, any>;
  // Call-to-action frame around the code; the rendered output grows to fit it
  frame?: QRFrame;
  // Blend a logo or photo into the modules (vector, no AI); see types/art.ts
  art?: QRArt;
  // Per-eye colors; each overrides eyeColor (outer) / dotColor (inner)
  eyeColors?: EyeColors;
  // Size of each data module, 0.5 to 1 (default 1). Connected styles get
  // thinner lines instead. Alignment patterns stay full size.
  moduleScale?: number;
  // Raise error correction to H when the logo covers more than 7% of the
  // code (off by default, so existing output never changes)
  autoLevel?: boolean;
}

export type QRPropsCanvas = QRProps &
  React.CanvasHTMLAttributes<HTMLCanvasElement>;
export type QRPropsSVG = QRProps & React.SVGProps<SVGSVGElement>;
