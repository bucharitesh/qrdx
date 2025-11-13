import type { CSSProperties } from "react";
import { z } from "zod";
import {
  type CornerEyeDotPattern,
  cornerEyeDotPatternSchema,
} from "./corner-dot";
import { type CornerEyePattern, cornerEyePatternSchema } from "./corner-eye";
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
});

export const errorLevelSchema = z.enum(["L", "M", "Q", "H"]);

export const qrPropsSchema = z.object({
  value: z.string(),
  size: z.number().optional(),
  level: errorLevelSchema.optional(),
  bgColor: z.string().optional(),
  fgColor: z.string().optional(),
  eyeColor: z.string().optional(),
  dotColor: z.string().optional(),
  bodyPattern: bodyPatternSchema.optional(),
  cornerEyePattern: cornerEyePatternSchema.optional(),
  cornerEyeDotPattern: cornerEyeDotPatternSchema.optional(),
  margin: z.number().optional(),
  imageSettings: imageSettingsSchema.optional(),
  isOGContext: z.boolean().optional(),
  templateId: z.string().optional(),
  customProps: z.record(z.string(), z.any()).optional(),
});

// Inferred types
export type ImageSettings = z.infer<typeof imageSettingsSchema>;
export type ErrorLevel = z.infer<typeof errorLevelSchema>;

export type QRProps = {
  value: string;
  size?: number;
  level?: ErrorLevel;
  bgColor?: string;
  fgColor?: string;
  eyeColor?: string;
  dotColor?: string;
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
};

export type QRPropsCanvas = QRProps &
  React.CanvasHTMLAttributes<HTMLCanvasElement>;
export type QRPropsSVG = QRProps & React.SVGProps<SVGSVGElement>;
