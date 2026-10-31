// WCAG contrast helpers for theme colors (solid hex or gradient stops).
import type { ColorConfig } from "qrdx/types";

function channel(value: number) {
  const c = value / 255;
  return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a #rgb / #rrggbb color, or null when unparseable. */
export function luminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const digits = (match[1] as string).replace(
    /^(.)(.)(.)$/,
    (_, r: string, g: string, b: string) => r + r + g + g + b + b,
  );
  const n = Number.parseInt(digits, 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return 1;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Every color a config paints with: the solid color or each gradient stop. */
export function colorStops(color: ColorConfig | undefined, fallback: string) {
  if (!color) return [fallback];
  if (typeof color === "string") return [color];
  return color.type === "solid"
    ? [color.color]
    : color.stops.map((stop) => stop.color);
}

/** Lowest contrast between any stop of `ink` and any stop of `ground`. */
export function worstContrast(
  ink: ColorConfig | undefined,
  ground: ColorConfig | undefined,
): number {
  let worst = Number.POSITIVE_INFINITY;
  for (const a of colorStops(ink, "#000000")) {
    for (const b of colorStops(ground, "#ffffff")) {
      worst = Math.min(worst, contrastRatio(a, b));
    }
  }
  return worst;
}

/** True when the background is darker than the modules (light-on-dark). */
export function isInverted(
  fg: ColorConfig | undefined,
  bg: ColorConfig | undefined,
) {
  const ink = luminance(colorStops(fg, "#000000")[0] as string) ?? 0;
  const ground = luminance(colorStops(bg, "#ffffff")[0] as string) ?? 1;
  return ink > ground;
}
