import { z } from "zod";

/**
 * Color type discriminator
 */
export const colorTypeSchema = z.enum(["solid", "linear", "radial", "angular"]);
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

/**
 * Union type for color configuration
 * Supports:
 * - string: backward compatible solid color
 * - SolidColor: explicit solid color object
 * - LinearGradient: linear gradient with stops and an angle
 * - RadialGradient: radial gradient from the centre out
 * - AngularGradient: conic gradient around the centre
 */
export const colorConfigSchema = z.union([
  z.string(),
  solidColorSchema,
  linearGradientSchema,
  radialGradientSchema,
  angularGradientSchema,
]);
export type ColorConfig = z.infer<typeof colorConfigSchema>;

/**
 * Helper to normalize color config to object format
 */
export function normalizeColorConfig(
  color: ColorConfig | undefined,
  fallback = "#000000"
): SolidColor | Gradient {
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
export function isGradient(color: ColorConfig | undefined): color is Gradient {
  if (!color || typeof color === "string") {
    return false;
  }
  return (
    color.type === "linear" ||
    color.type === "radial" ||
    color.type === "angular"
  );
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

/**
 * CSS `background` for a color config, for swatches and previews: the color
 * itself, or a CSS gradient that matches how the engine draws it (a linear
 * angle of 0 runs left to right, as in the QR code).
 */
export function getNormalizedColor(
  color: ColorConfig | string | undefined
): string {
  if (!color) {
    return "#000000";
  }

  if (typeof color === "string") {
    return color;
  }

  const normalized = normalizeColorConfig(color);
  if (normalized.type === "solid") {
    return normalized.color;
  }

  const sortedStops = [...normalized.stops].sort((a, b) => a.offset - b.offset);
  const colorStops = sortedStops
    .map((stop) => `${stop.color} ${stop.offset}%`)
    .join(", ");

  if (normalized.type === "linear") {
    // The engine's 0° points right; CSS's 0deg points up.
    return `linear-gradient(${(normalized.angle ?? 0) + 90}deg, ${colorStops})`;
  }

  if (normalized.type === "angular") {
    return `conic-gradient(from ${normalized.angle ?? 0}deg, ${colorStops})`;
  }

  return `radial-gradient(circle, ${colorStops})`;
}
