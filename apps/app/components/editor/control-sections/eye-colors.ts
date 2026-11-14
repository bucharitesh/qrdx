// Per-eye colors (the style's `eyeColors`): each finder eye's frame (outer)
// and center (inner) can differ from the Eyes and Dots colors. Used by the
// Design tab's Eye colors section and the preview's eye toolbar. Pure.
import {
  type ColorConfig,
  EYE_POSITIONS,
  type EyeColorOverride,
  type EyePosition,
} from "qrdx/types";
import type { QRStyle } from "@/types/theme";

/** True when at least one eye has its own color. */
export function hasEyeColors(style: Partial<QRStyle>): boolean {
  return EYE_POSITIONS.some(
    (position) =>
      style.eyeColors?.[position]?.outer || style.eyeColors?.[position]?.inner,
  );
}

/** The color an eye's frame is drawn in (its own, else the Eyes color). */
export function eyeOuterColor(
  style: Partial<QRStyle>,
  position: EyePosition,
): ColorConfig | undefined {
  return style.eyeColors?.[position]?.outer ?? style.eyeColor ?? style.fgColor;
}

/** The color an eye's center is drawn in (its own, else the Dots color). */
export function eyeInnerColor(
  style: Partial<QRStyle>,
  position: EyePosition,
): ColorConfig | undefined {
  return (
    style.eyeColors?.[position]?.inner ??
    style.dotColor ??
    style.eyeColor ??
    style.fgColor
  );
}

/** `eyeColors` with one eye's frame or center set to `color`. */
export function withEyeColor(
  eyeColors: QRStyle["eyeColors"],
  position: EyePosition,
  part: keyof EyeColorOverride,
  color: ColorConfig,
): NonNullable<QRStyle["eyeColors"]> {
  return {
    ...eyeColors,
    [position]: { ...eyeColors?.[position], [part]: color },
  };
}

/**
 * `eyeColors` without `position`'s own colors (the eye goes back to the
 * Eyes and Dots colors), or undefined when no eye has any left.
 */
export function withoutEyeColor(
  eyeColors: QRStyle["eyeColors"],
  position: EyePosition,
): QRStyle["eyeColors"] {
  if (!eyeColors) return;
  const kept: NonNullable<QRStyle["eyeColors"]> = {};
  for (const other of EYE_POSITIONS) {
    const eye = eyeColors[other];
    if (other !== position && (eye?.outer || eye?.inner)) kept[other] = eye;
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}
