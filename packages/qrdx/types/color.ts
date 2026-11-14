import { z } from "zod";

export {
  getColorString,
  getNormalizedColor,
  imagePositionCss,
  isGradient,
  isImagePaint,
  normalizeColorConfig,
} from "./color-helpers";

/**
 * Color type discriminator
 */
export const colorTypeSchema = z.enum([
  "solid",
  "linear",
  "radial",
  "angular",
  "image",
]);
export type ColorType = z.infer<typeof colorTypeSchema>;

/**
 * Solid color configuration. `color` is any CSS color the engine parses
 * (hex with or without alpha, rgb()/rgba(), a name); alpha is kept in it,
 * e.g. "#1d4ed880" or "rgba(29, 78, 216, 0.5)".
 */
export const solidColorSchema = z.object({
  type: z.literal("solid"),
  color: z.string(),
});
export type SolidColor = z.infer<typeof solidColorSchema>;

/**
 * Gradient stop configuration. A stop's color may carry alpha, as a solid
 * color does.
 */
export const gradientStopSchema = z.object({
  color: z.string(),
  offset: z.number().min(0).max(100), // percentage: 0-100
});
export type GradientStop = z.infer<typeof gradientStopSchema>;

/**
 * Linear gradient configuration
 */
export const linearGradientSchema = z.object({
  type: z.literal("linear"),
  stops: z.array(gradientStopSchema).min(2),
  angle: z.number().optional().default(0), // degrees: 0 = left-to-right, 90 = top-to-bottom
});
export type LinearGradient = z.infer<typeof linearGradientSchema>;

/**
 * Radial gradient configuration
 * Note: cx, cy, r, fx, fy are calculated automatically based on QR size
 * They use userSpaceOnUse units (absolute pixels)
 */
export const radialGradientSchema = z.object({
  type: z.literal("radial"),
  stops: z.array(gradientStopSchema).min(2),
});
export type RadialGradient = z.infer<typeof radialGradientSchema>;

/**
 * Angular (conic) gradient: the color sweeps clockwise around the centre of
 * the shape it fills, like CSS `conic-gradient(from <angle>deg, …)`.
 * `angle` is where the sweep starts, in degrees clockwise from the top
 * (0 = 12 o'clock). Offsets run 0–100 around the full turn.
 */
export const angularGradientSchema = z.object({
  type: z.literal("angular"),
  stops: z.array(gradientStopSchema).min(2),
  angle: z.number().optional().default(0),
});
export type AngularGradient = z.infer<typeof angularGradientSchema>;

/** Any gradient: linear, radial or angular. */
export type Gradient = LinearGradient | RadialGradient | AngularGradient;

/** How an image fill sits in the code: fill it, fit inside it, or repeat. */
export const imageFitSchema = z.enum(["cover", "contain", "tile"]);
export type ImageFit = z.infer<typeof imageFitSchema>;

/** Which part of the image stays in view (cover) or where it sits (contain). */
export const imagePositionSchema = z.enum([
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
]);
export type ImagePosition = z.infer<typeof imagePositionSchema>;

/**
 * An image fill: a picture painted through the shapes it fills, laid over
 * the code's whole area (so the dots and the eyes show one picture).
 *
 * `src` is held like a logo: a data URL (PNG or JPEG embed everywhere; other
 * formats are redrawn as PNG in the browser). Servers never fetch a remote
 * address. `scale` zooms around `position` (cover, contain) or sizes the
 * tiles (1 = four across). `opacity` lets `underlay`, a solid color under
 * the picture, show through: darken a photo for the dots, lighten it for
 * the background.
 */
export const imagePaintSchema = z.object({
  type: z.literal("image"),
  src: z.string().min(1),
  fit: imageFitSchema.optional().default("cover"),
  scale: z.number().min(0.1).max(4).optional().default(1),
  position: imagePositionSchema.optional().default("center"),
  opacity: z.number().min(0).max(1).optional().default(1),
  underlay: z.string().optional(),
});
export type ImagePaint = z.infer<typeof imagePaintSchema>;

/**
 * Union type for color configuration
 * Supports:
 * - string: backward compatible solid color
 * - SolidColor: explicit solid color object
 * - LinearGradient: linear gradient with stops and an angle
 * - RadialGradient: radial gradient from the centre out
 * - AngularGradient: conic gradient around the centre
 * - ImagePaint: a picture painted through the shapes
 */
export const colorConfigSchema = z.union([
  z.string(),
  solidColorSchema,
  linearGradientSchema,
  radialGradientSchema,
  angularGradientSchema,
  imagePaintSchema,
]);
export type ColorConfig = z.infer<typeof colorConfigSchema>;
