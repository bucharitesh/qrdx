import type { CSSProperties } from "react";
import { z } from "zod";
import { type ColorConfig, colorConfigSchema } from "./color";
import {
  type CornerEyeDotPattern,
  cornerEyeDotPatternSchema,
} from "./corner-dot";
import { type CornerEyePattern, cornerEyePatternSchema } from "./corner-eye";
import { type BodyPattern, bodyPatternSchema } from "./image-pattern";
import type { TemplateDefinition } from "./template";

// Image Settings for Default QRs (unchanged from original)
export const imageSettingsSchema = z.object({
  src: z.string(),
  height: z.number(),
  width: z.number(),
  excavate: z.boolean(),
  x: z.number().optional(),
  y: z.number().optional(),
});

// Logo Settings for Logo QRs
export const logoSettingsSchema = z.object({
  src: z.string(),
  logoSize: z.number().min(10).max(100), // Percentage: 10-100%
});

export const errorLevelSchema = z.enum(["L", "M", "Q", "H"]);

// Common props shared by both QR types
const commonQRPropsSchema = z.object({
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
  isOGContext: z.boolean().optional(),
  templateId: z.string().optional(),
  customProps: z.record(z.string(), z.any()).optional(),
});

// Default QR Props Schema
const defaultQRPropsSchema = commonQRPropsSchema.extend({
  type: z.literal("default").optional(),
  imageSettings: imageSettingsSchema.optional(),
});

// Logo QR Props Schema
const logoQRPropsSchema = commonQRPropsSchema.extend({
  type: z.literal("logo_qr"),
  logoSettings: logoSettingsSchema,
});

// Discriminated union schema
export const qrPropsSchema = z.union([
  defaultQRPropsSchema,
  logoQRPropsSchema,
]);

// Inferred types
export type ImageSettings = z.infer<typeof imageSettingsSchema>;
export type LogoSettings = z.infer<typeof logoSettingsSchema>;
export type ErrorLevel = z.infer<typeof errorLevelSchema>;

// Common props type
type CommonQRProps = {
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
  isOGContext?: boolean;
  templateId?: string;
  customTemplate?: TemplateDefinition<any>;
  customProps?: Record<string, any>;
};

// Default QR Props
type DefaultQRProps = CommonQRProps & {
  type?: "default";
  imageSettings?: ImageSettings;
};

// Logo QR Props
type LogoQRProps = CommonQRProps & {
  type: "logo_qr";
  logoSettings: LogoSettings;
};

// Discriminated union type
export type QRProps = DefaultQRProps | LogoQRProps;

export type QRPropsCanvas = QRProps &
  React.CanvasHTMLAttributes<HTMLCanvasElement>;
export type QRPropsSVG = QRProps & React.SVGProps<SVGSVGElement>;
