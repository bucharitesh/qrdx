import { z } from "zod";

/**
 * Color type discriminator
 */
export const colorTypeSchema = z.enum(["solid", "linear", "radial"]);
export type ColorType = z.infer<typeof colorTypeSchema>;

/**
 * Solid color configuration
 */
export const solidColorSchema = z.object({
  type: z.literal("solid"),
  color: z.string(),
});
export type SolidColor = z.infer<typeof solidColorSchema>;

/**
 * Gradient stop configuration
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
 * Union type for color configuration
 * Supports:
 * - string: backward compatible solid color
 * - SolidColor: explicit solid color object
 * - LinearGradient: linear gradient with start/end colors and angle
 * - RadialGradient: radial gradient with start/end colors and positioning
 */
export const colorConfigSchema = z.union([
  z.string(),
  solidColorSchema,
  linearGradientSchema,
  radialGradientSchema,
]);
export type ColorConfig = z.infer<typeof colorConfigSchema>;

/**
 * Helper to normalize color config to object format
 */
export function normalizeColorConfig(
  color: ColorConfig | undefined,
  fallback = "#000000"
): SolidColor | LinearGradient | RadialGradient {
  if (!color) {
    return { type: "solid", color: fallback };
  }
  if (typeof color === "string") {
    return { type: "solid", color };
  }
  return color;
}

/**
 * Helper to check if color is gradient
 */
export function isGradient(
  color: ColorConfig | undefined
): color is LinearGradient | RadialGradient {
  if (!color || typeof color === "string") {
    return false;
  }
  return color.type === "linear" || color.type === "radial";
}

/**
 * Helper to get a solid color string from any ColorConfig
 * For gradients, returns the first stop color
 */
export function getColorString(
  color: ColorConfig | undefined,
  fallback = "#000000"
): string {
  const normalized = normalizeColorConfig(color, fallback);
  if (normalized.type === "solid") {
    return normalized.color;
  }
  return normalized.stops[0]?.color || fallback;
}
