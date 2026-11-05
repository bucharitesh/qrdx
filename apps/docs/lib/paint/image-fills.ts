// Image fills travel like logos: they stay with the design they were
// uploaded into (the playground, a saved code, a saved theme) and never go
// into a link, a published style or a snippet. Where a design leaves, each
// image fill gives way to its underlay color (or the part's default).
import type { ColorConfig } from "qrdx/types";
import type { QRStyle } from "@/types/theme";

type Paint = ColorConfig | undefined;

const isImage = (paint: Paint) =>
  typeof paint === "object" && paint !== null && paint.type === "image";

/** True when any part of the design is painted with a picture. */
export function hasImageFills(style: Partial<QRStyle>): boolean {
  return (
    [style.bgColor, style.fgColor, style.eyeColor, style.dotColor].some(
      isImage,
    ) ||
    Object.values(style.eyeColors ?? {}).some(
      (eye) => isImage(eye?.outer) || isImage(eye?.inner),
    )
  );
}

/**
 * `style` with each image fill swapped for its underlay color, or left
 * unset without one (the part draws its default). The same object comes
 * back when there are none.
 */
export function withoutImageFills<T extends Partial<QRStyle>>(style: T): T {
  if (!hasImageFills(style)) return style;
  const swap = (paint: Paint) =>
    typeof paint === "object" && paint?.type === "image"
      ? paint.underlay
      : paint;
  const next: T = {
    ...style,
    bgColor: swap(style.bgColor),
    fgColor: swap(style.fgColor),
    eyeColor: swap(style.eyeColor),
    dotColor: swap(style.dotColor),
  };
  if (style.eyeColors) {
    next.eyeColors = Object.fromEntries(
      Object.entries(style.eyeColors).map(([position, eye]) => [
        position,
        eye && { outer: swap(eye.outer), inner: swap(eye.inner) },
      ]),
    ) as T["eyeColors"];
  }
  for (const key of ["bgColor", "fgColor", "eyeColor", "dotColor"] as const) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}
