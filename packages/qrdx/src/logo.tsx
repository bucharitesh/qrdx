/** biome-ignore-all lint/style/noMagicNumbers: logo geometry */
// The center logo as SVG: an optional plate behind it and a crop to its
// shape (imageSettings.shape and .plate). Everything is plain SVG (a filled
// shape, a <clipPath> and an <image>), which the PDF and EPS exporters
// draw too: their painters clip to the same outline.
import type { JSX } from "react";
import type { ImageSettings, LogoShape } from "../types";
import { hashString } from "./shapes";
import { fmt } from "./utils/fmt";

/** Rounded corners' radius, as a share of the logo's shorter side. */
export const LOGO_ROUNDED_RADIUS = 0.22;
/** With a plate, the logo is inset this share of the box on each side. */
export const LOGO_PLATE_INSET = 0.14;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The outline of `shape` filling `box`, as an SVG element. */
function shapeElement(
  shape: LogoShape,
  box: Box,
  props: Record<string, string> = {}
): JSX.Element {
  if (shape === "circle") {
    return (
      <circle
        cx={fmt(box.x + box.w / 2)}
        cy={fmt(box.y + box.h / 2)}
        r={fmt(Math.min(box.w, box.h) / 2)}
        {...props}
      />
    );
  }
  const radius =
    shape === "rounded" ? Math.min(box.w, box.h) * LOGO_ROUNDED_RADIUS : 0;
  return (
    <rect
      height={fmt(box.h)}
      width={fmt(box.w)}
      x={fmt(box.x)}
      y={fmt(box.y)}
      {...(radius > 0 && { rx: fmt(radius), ry: fmt(radius) })}
      {...props}
    />
  );
}

/** `box` shrunk by `share` of its size on every side. */
function inset(box: Box, share: number): Box {
  const dx = box.w * share;
  const dy = box.h * share;
  return { x: box.x + dx, y: box.y + dy, w: box.w - 2 * dx, h: box.h - 2 * dy };
}

/**
 * The logo in `box` (the user units of the surrounding SVG): the image,
 * cropped to `settings.shape`, on a `settings.plate` plate when one is set.
 * A plain square logo is a bare <image>, exactly as before.
 */
export function renderLogo(
  settings: Pick<ImageSettings, "src" | "shape" | "plate">,
  box: Box
): JSX.Element {
  const shape = settings.shape ?? "square";
  const plate = settings.plate;
  const imageBox = plate ? inset(box, LOGO_PLATE_INSET) : box;
  const image = (clipId?: string) => (
    <image
      height={fmt(imageBox.h)}
      href={settings.src}
      preserveAspectRatio="none"
      width={fmt(imageBox.w)}
      x={fmt(imageBox.x)}
      y={fmt(imageBox.y)}
      {...(clipId && { clipPath: `url(#${clipId})` })}
    />
  );
  if (shape === "square" && !plate) {
    return image();
  }
  // Ids are global in a page: derive them from the geometry, so two codes
  // with the same logo box share an identical clip
  const clipId =
    shape === "square"
      ? undefined
      : `qrdx-logo-${hashString(
          `${shape}|${fmt(imageBox.x)}|${fmt(imageBox.y)}|${fmt(imageBox.w)}|${fmt(imageBox.h)}`
        )}`;
  return (
    <g>
      {plate && shapeElement(shape, box, { fill: plate })}
      {clipId && (
        <clipPath id={clipId}>{shapeElement(shape, imageBox)}</clipPath>
      )}
      {image(clipId)}
    </g>
  );
}

/**
 * Traces `shape` filling `box` on a canvas path (for `QRCodeCanvas`), so the
 * caller can fill it (the plate) or clip to it (the logo).
 */
export function traceLogoShape(
  ctx: CanvasRenderingContext2D,
  shape: LogoShape,
  box: Box
) {
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(
      box.x + box.w / 2,
      box.y + box.h / 2,
      Math.min(box.w, box.h) / 2,
      0,
      Math.PI * 2
    );
    return;
  }
  const radius =
    shape === "rounded" ? Math.min(box.w, box.h) * LOGO_ROUNDED_RADIUS : 0;
  if (radius > 0 && typeof ctx.roundRect === "function") {
    ctx.roundRect(box.x, box.y, box.w, box.h, radius);
  } else {
    ctx.rect(box.x, box.y, box.w, box.h);
  }
}

/** The box the logo image fills inside `box` (inset when on a plate). */
export function logoImageBox(box: Box, plate: string | undefined): Box {
  return plate ? inset(box, LOGO_PLATE_INSET) : box;
}
