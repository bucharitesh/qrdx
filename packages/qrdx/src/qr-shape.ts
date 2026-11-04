/** biome-ignore-all lint/style/noMagicNumbers: disc geometry */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: a 32-bit PRNG */
// Circle codes (QRProps.shape = "circle"): the real symbol sits in the middle
// of a disc, keeps a light quiet ring of `margin` modules (at least
// QR_CIRCLE_QUIET_MIN), and the rest of the disc is filled with decorative
// modules on the same grid, so the code reads as one round pattern.
// Decoders only ever see the symbol: the ring separates it from the noise.
import type { Modules } from "../types";
import { QR_CIRCLE_QUIET_MIN, type QRShape } from "../types/qr";
import { hashString } from "./shapes";

/** Decoration beyond the symbol's corners, in modules (on the diagonal). */
const CORNER_BAND = 1;
/** Light rim between the decoration and the disc's edge, in modules. */
const EDGE_INSET = 0.5;
/** Share of decorative cells that are dark (data is about half dark). */
const DENSITY = 0.5;

/** The light ring a circle code keeps around its symbol, in modules. */
export function circleQuietZone(margin: number): number {
  return Math.max(margin, QR_CIRCLE_QUIET_MIN);
}

/**
 * Modules between the symbol and the edge of the artwork it is drawn in:
 * `margin` for a square code; for a circle, enough for the symbol, its
 * quiet ring and a band of decoration to fit inside the disc.
 */
export function getLayoutMargin(
  symbolModules: number,
  margin: number,
  shape: QRShape | undefined
): number {
  if (shape !== "circle") {
    return margin;
  }
  const quiet = circleQuietZone(margin);
  const radius = (symbolModules / 2 + quiet) * Math.SQRT2 + CORNER_BAND;
  return Math.ceil(radius - symbolModules / 2);
}

/** Small deterministic PRNG (mulberry32), seeded per code. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * The decorative modules of a circle code, on the whole layout grid
 * (`symbolModules + 2 × layoutMargin` across): dark cells outside the
 * symbol's quiet ring and inside the disc, the same for the same `value`.
 */
export function circleDecoration(
  value: string,
  symbolModules: number,
  margin: number
): Modules {
  const layout = getLayoutMargin(symbolModules, margin, "circle");
  const quiet = circleQuietZone(margin);
  const size = symbolModules + 2 * layout;
  const center = size / 2;
  const limit = center - EDGE_INSET - 0.5;
  const next = random(Number.parseInt(hashString(value), 36) || 1);
  const low = layout - quiet;
  const high = layout + symbolModules + quiet;
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const dark = next() < DENSITY;
      if (x >= low && x < high && y >= low && y < high) {
        return false;
      }
      return dark && Math.hypot(x + 0.5 - center, y + 0.5 - center) <= limit;
    })
  );
}
