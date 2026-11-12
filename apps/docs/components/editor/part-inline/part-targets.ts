// The parts of the code the preview lets you click (eyes, dots, logo,
// background, frame) and how their buttons stack. Pure: the boxes come from
// part-boxes.ts, measured in the browser.
import type { Box } from "../frame-inline/preview-labels";

/** What a part's toolbar edits. */
export type PartId = "eyes" | "dots" | "logo" | "background" | "frame";

/** Tab order: eyes, dots, logo, background, frame. */
export const PART_ORDER: readonly PartId[] = [
  "eyes",
  "dots",
  "logo",
  "background",
  "frame",
];

/** Stacking, bottom to top: the frame, the background, the dots, then the logo and the eyes. */
export const PART_LAYER: Record<PartId, number> = {
  frame: 0,
  background: 1,
  dots: 2,
  logo: 3,
  eyes: 3,
};

/**
 * How far past the code's edge the background takes clicks (CSS px). The
 * dots cover most of the code, and the default code has no quiet zone, so
 * without this strip the background could only be reached with Tab.
 */
export const BACKGROUND_REACH = 8;

/** Where each part is drawn, relative to the preview (part-boxes.ts). */
export interface MeasuredParts {
  /** One per finder eye, outer ring and centre together */
  eyes: Box[];
  dots: Box | null;
  logo: Box | null;
  background: Box | null;
  /** The whole artwork, frame included */
  artwork: Box | null;
}

export const NO_PARTS: MeasuredParts = {
  eyes: [],
  dots: null,
  logo: null,
  background: null,
  artwork: null,
};

export interface PartTarget {
  part: PartId;
  /** Where its buttons go (three for the eyes) */
  boxes: Box[];
  /** Higher is on top */
  layer: number;
}

/** The smallest box around `boxes`, or null when there are none. */
export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** `box` grown by `by` on every side. */
export function grow(box: Box, by: number): Box {
  return {
    left: box.left - by,
    top: box.top - by,
    width: box.width + 2 * by,
    height: box.height + 2 * by,
  };
}

const visible = (box: Box | null): box is Box =>
  Boolean(box && box.width > 0 && box.height > 0);

/**
 * The buttons to lay over the preview, in Tab order. Parts that aren't drawn
 * get none (no logo shown, no frame on); the frame's button covers the
 * whole artwork and sits under everything else.
 */
export function partTargets(
  measured: MeasuredParts,
  { frame }: { frame: boolean },
): PartTarget[] {
  const boxes: Record<PartId, Box[]> = {
    eyes: measured.eyes.filter(visible),
    dots: visible(measured.dots) ? [measured.dots] : [],
    logo: visible(measured.logo) ? [measured.logo] : [],
    background: visible(measured.background)
      ? [grow(measured.background, BACKGROUND_REACH)]
      : [],
    frame: frame && visible(measured.artwork) ? [measured.artwork] : [],
  };
  return PART_ORDER.filter((part) => boxes[part].length > 0).map((part) => ({
    part,
    boxes: boxes[part],
    layer: PART_LAYER[part],
  }));
}

/** Where a part's toolbar anchors: around everything the part draws. */
export function anchorOf(part: PartId, measured: MeasuredParts): Box | null {
  switch (part) {
    case "eyes":
      return unionBox(measured.eyes);
    case "dots":
      return measured.dots;
    case "logo":
      return measured.logo;
    case "background":
      return measured.background;
    default:
      return measured.artwork;
  }
}

/**
 * What the toolbar is placed beside (menu-placement.ts): the part's width,
 * the whole artwork's height. Parts sit inside the code, so a toolbar
 * right beside one would cover the code; this keeps it above (or below)
 * the artwork, lined up with the part.
 */
export function toolbarAnchor(part: Box, artwork: Box | null): Box {
  if (!artwork) return part;
  return {
    left: part.left,
    width: part.width,
    top: artwork.top,
    height: artwork.height,
  };
}

/** The part whose button is on top at (x, y), the way the buttons stack. */
export function partAt(
  targets: PartTarget[],
  x: number,
  y: number,
): PartId | null {
  let found: PartTarget | null = null;
  for (const target of targets) {
    const hit = target.boxes.some(
      (box) =>
        x >= box.left &&
        x <= box.left + box.width &&
        y >= box.top &&
        y <= box.top + box.height,
    );
    if (hit && (!found || target.layer >= found.layer)) found = target;
  }
  return found?.part ?? null;
}
