// Color helpers, without zod: the engine draws with these, so rendering a
// code never loads zod. The color schemas and types are in color.ts, which
// re-exports these.
import type {
  ColorConfig,
  Gradient,
  ImagePaint,
  ImagePosition,
  SolidColor,
} from "./color";

/**
 * Helper to normalize color config to object format
 */
export function normalizeColorConfig(
  color: ColorConfig | undefined,
  fallback = "#000000"
): SolidColor | Gradient | ImagePaint {
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

/** True for an image fill. */
export function isImagePaint(
  color: ColorConfig | undefined
): color is ImagePaint {
  return typeof color === "object" && color !== null && color.type === "image";
}

/**
 * Helper to get a solid color string from any ColorConfig
 * For gradients, returns the first stop color; for an image fill, its
 * underlay (or `fallback`)
 */
export function getColorString(
  color: ColorConfig | undefined,
  fallback = "#000000"
): string {
  const normalized = normalizeColorConfig(color, fallback);
  if (normalized.type === "solid") {
    return normalized.color;
  }
  if (normalized.type === "image") {
    return normalized.underlay || fallback;
  }
  return normalized.stops[0]?.color || fallback;
}

/** CSS `background-position` for an image fill's position. */
export function imagePositionCss(position: ImagePosition = "center"): string {
  const [first, second] = position.split("-") as [string, string | undefined];
  if (position === "center") {
    return "center";
  }
  if (second) {
    return `${second} ${first}`;
  }
  return first === "top" || first === "bottom"
    ? `center ${first}`
    : `${first} center`;
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

  if (normalized.type === "image") {
    const size =
      normalized.fit === "tile"
        ? `${25 * (normalized.scale ?? 1)}% auto`
        : (normalized.scale ?? 1) === 1
          ? normalized.fit === "contain"
            ? "contain"
            : "cover"
          : `${100 * (normalized.scale ?? 1)}% auto`;
    const repeat = normalized.fit === "tile" ? "repeat" : "no-repeat";
    const url = `url("${normalized.src.replace(/"/g, "%22")}")`;
    return `${url} ${imagePositionCss(normalized.position)} / ${size} ${repeat}, ${normalized.underlay ?? "transparent"}`;
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
