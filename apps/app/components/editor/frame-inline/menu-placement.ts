// Where the inline editor's menu floats beside a frame label. Pure.
import type { Box } from "./preview-labels";

// Room kept between the menu and the text, and around the preview's edge
const GAP = 10;
const EDGE = 8;
// The scan score badge sits along the preview's bottom edge
const BOTTOM_RESERVE = 64;

/**
 * Where the menu goes: just outside the frame on the edge nearer the text,
 * so it covers no artwork; else right beside the text on that side, then
 * on the other side, then outside the far edge. Horizontally it follows
 * the text, inside the preview.
 */
export function placeMenu(
  menu: { width: number; height: number },
  anchor: Box,
  artwork: Box | null,
  bounds: { width: number; height: number },
): { left: number; top: number; above: boolean } {
  const aboveOf = (box: Box) => ({
    top: box.top - GAP - menu.height,
    above: true,
  });
  const belowOf = (box: Box) => ({
    top: box.top + box.height + GAP,
    above: false,
  });
  const art = artwork ?? anchor;
  const nearerTop = anchor.top + anchor.height / 2 <= art.top + art.height / 2;
  const candidates = nearerTop
    ? [aboveOf(art), aboveOf(anchor), belowOf(anchor), belowOf(art)]
    : [belowOf(art), belowOf(anchor), aboveOf(anchor), aboveOf(art)];
  const fits = ({ top }: { top: number }) =>
    top >= EDGE && top + menu.height <= bounds.height - BOTTOM_RESERVE;
  const chosen = candidates.find(fits) ?? {
    top: Math.max(EDGE, anchor.top - GAP - menu.height),
    above: true,
  };
  const left = Math.min(
    Math.max(EDGE, anchor.left + anchor.width / 2 - menu.width / 2),
    Math.max(EDGE, bounds.width - menu.width - EDGE),
  );
  return { left, top: chosen.top, above: chosen.above };
}
