// Reads where the code's parts are drawn in the playground preview: the
// engine marks them when the preview renders with `partMarkers`
// (data-qrdx-part, and data-qrdx-eye on the finder eyes). Boxes are relative
// to the overlay root, in CSS px. Browser only.
import { QR_EYE_ATTRIBUTE, QR_PART_ATTRIBUTE, type QRPart } from "qrdx";
import { type Box, measureArtwork } from "../frame-inline/preview-labels";
import {
  intersectBox,
  type MeasuredParts,
  NO_PARTS,
  symbolBox,
  unionBox,
} from "./part-targets";

const EYES = ["top-left", "top-right", "bottom-left"] as const;

function boxOf(element: Element, origin: DOMRect): Box | null {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    width: rect.width,
    height: rect.height,
  };
}

/** Every marked part inside `svg` (the preview's outer <svg>), relative to `root`. */
export function measureParts(
  svg: SVGSVGElement,
  root: HTMLElement,
): MeasuredParts {
  const origin = root.getBoundingClientRect();
  const byPart = new Map<QRPart, Box[]>();
  const byEye = new Map<string, Box[]>();
  for (const element of svg.querySelectorAll(`[${QR_PART_ATTRIBUTE}]`)) {
    const part = element.getAttribute(QR_PART_ATTRIBUTE) as QRPart;
    const box = boxOf(element, origin);
    if (!box) continue;
    byPart.set(part, [...(byPart.get(part) ?? []), box]);
    const eye = element.getAttribute(QR_EYE_ATTRIBUTE);
    if (eye) byEye.set(eye, [...(byEye.get(eye) ?? []), box]);
  }
  if (byPart.size === 0) return NO_PARTS;
  const eyes = EYES.flatMap((eye) => {
    const box = unionBox(byEye.get(eye) ?? []);
    return box ? [box] : [];
  });
  const found = eyes.length === EYES.length ? eyes : [];
  const symbol = symbolBox(found);
  const body = unionBox(byPart.get("body") ?? []);
  return {
    eyes: found,
    symbol,
    // A shaped code's ring is drawn with the dots: the dots stop at the
    // symbol, and the ring around it is the background's
    dots: body && symbol ? intersectBox(body, symbol) : body,
    logo: unionBox(byPart.get("logo") ?? []),
    background: unionBox(byPart.get("background") ?? []),
    artwork: measureArtwork(svg, root),
  };
}

/** A stable key for a measurement, so unchanged layouts don't re-render. */
export function partsKey(parts: MeasuredParts): string {
  const round = (box: Box | null) =>
    box
      ? [box.left, box.top, box.width, box.height].map((n) => Math.round(n * 2))
      : null;
  return JSON.stringify([
    parts.eyes.map(round),
    round(parts.symbol),
    round(parts.dots),
    round(parts.logo),
    round(parts.background),
    round(parts.artwork),
  ]);
}
