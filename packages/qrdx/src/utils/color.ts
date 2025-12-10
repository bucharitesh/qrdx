import type { ColorConfig } from "../../types/color";

/**
 * Get solid color representation from ColorConfig
 * For gradients, returns the first stop color as representative
 * This is useful for cases where you need a single color value (e.g., CSS backgrounds, color displays)
 *
 * @param colorConfig - The color configuration (can be string, solid, linear, or radial gradient)
 * @param fallback - Fallback color if colorConfig is undefined or invalid
 * @returns A solid color hex string
 */
export function getSolidColor(
  colorConfig: ColorConfig | undefined,
  fallback = "#000000"
): string {
  if (!colorConfig) {
    return fallback;
  }

  if (typeof colorConfig === "string") {
    return colorConfig;
  }

  if (colorConfig.type === "solid") {
    return colorConfig.color;
  }

  // For gradients, return the first stop color as representative
  if (colorConfig.type === "linear" || colorConfig.type === "radial") {
    return colorConfig.stops[0]?.color || fallback;
  }

  return fallback;
}
