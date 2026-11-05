/** biome-ignore-all lint/style/noMagicNumbers: disc geometry */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: a 32-bit PRNG */
// Shaped codes (QRProps.shape): the real symbol sits in the middle of a
// disc ("circle"), a heart ("heart") or a silhouette of your own
// (QRSilhouette), keeps a light quiet ring of `margin` modules (at least
// QR_CIRCLE_QUIET_MIN), and the rest of the outline is filled with
// decorative modules on the same grid, so the code reads as one pattern.
// Decoders only ever see the symbol: the ring separates it from the noise.
import type { Modules } from "../types";
import {
  QR_CIRCLE_QUIET_MIN,
  type QRCodeShape,
  type QRSilhouette,
} from "../types/qr";
import {
  getHeartOutline,
  getSilhouetteOutline,
  insideTester,
  type Outline,
  outlinePath,
} from "./qr-outline";
import { circlePath, hashString } from "./shapes";

/** Decoration beyond the symbol's corners, in modules (on the diagonal). */
const CORNER_BAND = 1;
/** Light rim between the decoration and the disc's edge, in modules. */
const EDGE_INSET = 0.5;
/** Share of decorative cells that are dark (data is about half dark). */
const DENSITY = 0.5;
/**
 * Room between a heart's or silhouette's quiet ring and its edge, in
 * modules, where the ring meets the outline (at a heart's notch).
 */
const OUTLINE_GAP = 0.5;

/** The light ring a shaped code keeps around its symbol, in modules. */
export function circleQuietZone(margin: number): number {
  return Math.max(margin, QR_CIRCLE_QUIET_MIN);
}

/**
 * The outline a heart or silhouette code is drawn in, or null for square
 * and circle codes and for silhouettes that can't hold a code (those draw
 * as square codes).
 */
export function getShapeOutline(
  shape: QRCodeShape | undefined
): Outline | null {
  if (shape === "heart") {
    return getHeartOutline();
  }
  if (typeof shape === "object" && shape?.type === "silhouette") {
    return getSilhouetteOutline(shape).outline;
  }
  return null;
}

/**
 * True when the code is drawn in an outline (a circle, a heart or a
 * silhouette that fits) rather than as a plain square.
 */
export function isShapedCode(shape: QRCodeShape | undefined): boolean {
  return shape === "circle" || getShapeOutline(shape) !== null;
}

/** Whether a silhouette can hold a code, and why not. */
export type QRSilhouetteFit =
  | {
      ok: true;
      /** Share of the artwork's width the symbol and its quiet ring take */
      share: number;
    }
  | {
      ok: false;
      reason: "invalid" | "empty" | "thin";
      /** A sentence for people, e.g. for an upload control */
      message: string;
    };

const FIT_MESSAGES = {
  invalid: "This silhouette isn't a valid shape grid.",
  empty:
    "No shape found: use a picture with a dark or opaque shape on a light or clear background.",
  thin: "This shape is too thin to hold the code with its quiet zone. Try a rounder, fuller shape.",
} as const;

/**
 * Whether `silhouette` is roomy enough for a code: the symbol and its quiet
 * ring must take at least QR_SILHOUETTE_MIN_SHARE of the artwork's width.
 * Silhouettes that fail draw as square codes; editors should refuse them
 * with `message`.
 */
export function getQRSilhouetteFit(silhouette: QRSilhouette): QRSilhouetteFit {
  const { outline, problem } = getSilhouetteOutline(silhouette);
  if (outline && !problem) {
    return { ok: true, share: 2 * outline.half };
  }
  const reason = problem ?? "invalid";
  return { ok: false, reason, message: FIT_MESSAGES[reason] };
}

/**
 * Modules between the symbol and the edge of the artwork it is drawn in:
 * `margin` for a square code; for a shaped one, enough for the symbol, its
 * quiet ring and a band of decoration to fit inside the outline.
 */
export function getLayoutMargin(
  symbolModules: number,
  margin: number,
  shape: QRCodeShape | undefined
): number {
  if (shape === "circle") {
    const quiet = circleQuietZone(margin);
    const radius = (symbolModules / 2 + quiet) * Math.SQRT2 + CORNER_BAND;
    return Math.ceil(radius - symbolModules / 2);
  }
  const outline = getShapeOutline(shape);
  if (!outline) {
    return margin;
  }
  // The centered square inside the outline holds the symbol, its quiet ring
  // and the gap on each side.
  const quiet = circleQuietZone(margin);
  const across =
    (symbolModules + 2 * (quiet + OUTLINE_GAP)) / (2 * outline.half);
  return Math.ceil((across - symbolModules) / 2 - 1e-9);
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

/** Where a decorative module is checked, around its center (modules). */
const RIM_SAMPLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)] as const;
});

/**
 * The decorative modules of a code drawn in an outline (circle, heart or
 * silhouette), on the whole layout grid, or null for a square code. Like a
 * circle's: about half dark, seeded by `value`, outside the quiet ring and
 * at least EDGE_INSET inside the outline.
 */
export function shapeDecoration(
  value: string,
  symbolModules: number,
  margin: number,
  shape: QRCodeShape | undefined
): Modules | null {
  if (shape === "circle") {
    return circleDecoration(value, symbolModules, margin);
  }
  const outline = getShapeOutline(shape);
  if (!outline) {
    return null;
  }
  const layout = getLayoutMargin(symbolModules, margin, shape);
  const quiet = circleQuietZone(margin);
  const size = symbolModules + 2 * layout;
  const inside = insideTester(outline.polygons);
  // A module and its rim (a disc of 0.5 + EDGE_INSET) must be inside
  const reach = 0.5 + EDGE_INSET;
  const fits = (x: number, y: number) => {
    const cx = x + 0.5;
    const cy = y + 0.5;
    if (!inside(cx / size, cy / size)) return false;
    return RIM_SAMPLES.every(([dx, dy]) =>
      inside((cx + dx * reach) / size, (cy + dy * reach) / size)
    );
  };
  const next = random(Number.parseInt(hashString(value), 36) || 1);
  const low = layout - quiet;
  const high = layout + symbolModules + quiet;
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const dark = next() < DENSITY;
      if (x >= low && x < high && y >= low && y < high) {
        return false;
      }
      return dark && fits(x, y);
    })
  );
}

/**
 * The background outline of a shaped code drawn `size` px across: a disc
 * (`{ circle: r }`), path data for a heart or silhouette, or null for a
 * square code.
 */
export function shapeBackground(
  shape: QRCodeShape | undefined,
  size: number
): { circle: number } | { path: string } | null {
  if (shape === "circle") {
    return { circle: size / 2 };
  }
  const outline = getShapeOutline(shape);
  return outline ? { path: outlinePath(outline, size) } : null;
}

/**
 * Path data of a shaped code's outline drawn `size` px across, for editors
 * that preview a shape on its own; null for a square code (or a silhouette
 * that can't hold one, which draws square).
 */
export function getQRShapePath(
  shape: QRCodeShape | undefined,
  size: number
): string | null {
  const background = shapeBackground(shape, size);
  if (!background) {
    return null;
  }
  return "circle" in background
    ? circlePath(size / 2, size / 2, background.circle)
    : background.path;
}
