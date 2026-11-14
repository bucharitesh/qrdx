// The preview's direct handles, as numbers: dragging the logo to move it
// (logoOptions.x / y), its corner to resize it (logoOptions.size), the arrow
// keys to nudge it, and the code's edge to change the quiet zone (margin).
// Pure: boxes are on-screen CSS px, measured by part-boxes.ts.
import { LOGO_SIZE_MAX, LOGO_SIZE_MIN } from "qrdx/types";
import type { Box } from "../frame-inline/preview-labels";

/** Within this share of the middle, a moved logo snaps back to center. */
export const LOGO_CENTER_SNAP = 0.015;
/** Arrow keys move the logo this share of the code (Shift: LOGO_NUDGE_BIG). */
export const LOGO_NUDGE = 0.01;
export const LOGO_NUDGE_BIG = 0.05;
/** Arrow keys resize it by this share (Shift: LOGO_RESIZE_BIG). */
export const LOGO_RESIZE_STEP = 0.01;
export const LOGO_RESIZE_BIG = 0.05;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/**
 * Where the logo's center may go, as a share across the symbol: the engine
 * keeps the whole logo inside it (packages/qrdx/src/helpers.ts).
 */
export function logoCenterRange(
  logoPx: number,
  symbolPx: number,
): [number, number] {
  if (symbolPx <= 0) return [0.5, 0.5];
  const half = Math.min(0.5, logoPx / 2 / symbolPx);
  return [half, 1 - half];
}

/** The logo's center now, as shares across the symbol. */
export function logoCenter(logo: Box, symbol: Box): { x: number; y: number } {
  return {
    x: (logo.left + logo.width / 2 - symbol.left) / symbol.width,
    y: (logo.top + logo.height / 2 - symbol.top) / symbol.height,
  };
}

function placeShare(
  share: number,
  logoPx: number,
  symbolPx: number,
  snap: boolean,
) {
  const [min, max] = logoCenterRange(logoPx, symbolPx);
  const placed = clamp(share, min, max);
  return snap && Math.abs(placed - 0.5) <= LOGO_CENTER_SNAP
    ? 0.5
    : round(placed, 3);
}

/**
 * The logo moved by (dx, dy) px from where it was when the drag started
 * (`logo`, inside `symbol`), as logoOptions.x / y. It stops at the symbol's
 * edges, like the engine, and snaps to the middle near it.
 */
export function movedLogo(
  delta: { dx: number; dy: number },
  geometry: { logo: Box; symbol: Box },
  { snap = true }: { snap?: boolean } = {},
): { x: number; y: number } {
  const { logo, symbol } = geometry;
  const start = logoCenter(logo, symbol);
  return {
    x: placeShare(
      start.x + delta.dx / symbol.width,
      logo.width,
      symbol.width,
      snap,
    ),
    y: placeShare(
      start.y + delta.dy / symbol.height,
      logo.height,
      symbol.height,
      snap,
    ),
  };
}

/**
 * The logo nudged one step by an arrow key (a bigger step with Shift), as
 * logoOptions.x / y, or null for any other key.
 */
export function nudgedLogo(
  key: string,
  shift: boolean,
  geometry: { logo: Box; symbol: Box },
): { x: number; y: number } | null {
  const step = (shift ? LOGO_NUDGE_BIG : LOGO_NUDGE) * geometry.symbol.width;
  const delta =
    key === "ArrowLeft"
      ? { dx: -step, dy: 0 }
      : key === "ArrowRight"
        ? { dx: step, dy: 0 }
        : key === "ArrowUp"
          ? { dx: 0, dy: -step }
          : key === "ArrowDown"
            ? { dx: 0, dy: step }
            : null;
  // No snapping: a step from the middle has to leave it
  return delta ? movedLogo(delta, geometry, { snap: false }) : null;
}

/**
 * The logo's size (logoOptions.size, a share of the code's width) after
 * its bottom-right corner moved by (dx, dy) px. The logo grows from its
 * center, so the corner's move counts twice. Between LOGO_SIZE_MIN and the
 * smaller of LOGO_SIZE_MAX and `max` (what the code can repair).
 */
export function resizedLogo(
  delta: { dx: number; dy: number },
  geometry: { logo: Box; code: Box },
  max: number = LOGO_SIZE_MAX,
): number {
  const { logo, code } = geometry;
  if (code.width <= 0) return LOGO_SIZE_MIN;
  const width = logo.width + delta.dx + delta.dy;
  return round(
    clamp(width / code.width, LOGO_SIZE_MIN, Math.min(LOGO_SIZE_MAX, max)),
    2,
  );
}

/** The size after an arrow key on the resize handle, or null for other keys. */
export function steppedLogoSize(
  key: string,
  shift: boolean,
  size: number,
  max: number = LOGO_SIZE_MAX,
): number | null {
  const step = shift ? LOGO_RESIZE_BIG : LOGO_RESIZE_STEP;
  const change =
    key === "ArrowUp" || key === "ArrowRight"
      ? step
      : key === "ArrowDown" || key === "ArrowLeft"
        ? -step
        : null;
  if (change === null) return null;
  return round(
    clamp(size + change, LOGO_SIZE_MIN, Math.min(LOGO_SIZE_MAX, max)),
    2,
  );
}

/**
 * The quiet zone (margin, in modules) after the code's edge handle was
 * dragged `inward` px toward the middle (negative: outward), from `start`
 * modules, with modules `modulePx` wide when the drag began. Whole
 * modules, 0 to `max` (the padding control's range).
 */
export function marginFromDrag(
  start: number,
  inward: number,
  modulePx: number,
  max: number,
): number {
  if (modulePx <= 0) return clamp(start, 0, max);
  return clamp(Math.round(start + inward / modulePx), 0, max);
}

/** The margin after an arrow key on the edge handle, or null for other keys. */
export function steppedMargin(
  key: string,
  margin: number,
  max: number,
): number | null {
  if (key === "ArrowUp" || key === "ArrowRight") {
    return clamp(margin + 1, 0, max);
  }
  if (key === "ArrowDown" || key === "ArrowLeft") {
    return clamp(margin - 1, 0, max);
  }
  if (key === "Home") return 0;
  if (key === "End") return max;
  return null;
}
