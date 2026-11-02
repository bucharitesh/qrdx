// The least blend: the smallest change to the art model's image that makes it
// scan, found by a search over one strength (0 = the image as drawn, 1 = every
// module forced to its value). Pure pixel math, so tests run it on fake images.
//
// Why images that look scannable fail: in the eval, the models kept 96–100% of
// the modules right, yet jsQR found no code in any of them. jsQR (a port of
// ZXing's detector) ranks finder candidates by an absolute pixel error and
// only tries its best triple, so at 1024 px the real 23 px-module finders,
// carrying the scene's texture and ragged edges, lose to small finder-like
// clusters of texture inside the code. And under the phone-camera model, a
// scene painted into the quiet zone swallows the finders' outer ring. So the
// blend works in this order:
// 1. Register the module grid where the model drew it (models move or scale
//    the code by a few percent), against the control's module map.
// 2. At strength s, push each module's pixels toward its value just past
//    luma limits that tighten with s (function patterns and the quiet zone
//    twice as fast as data), covering more of each data module as s grows.
// 3. Clean the function patterns and quiet zone (and, near the top of the
//    range, the data modules) in the binarizer's own terms: reproduce jsQR's
//    HybridBinarizer thresholds and nudge only the pixels it would read
//    wrong just across their threshold.
// The caller keeps the delivery gate: only images scanQRPixels decodes are
// delivered, and the search asks for more than the gate (a smaller code too).

import { deflateSync } from "node:zlib";
import { type DecodedImage, PIXEL_SCAN_SIZES, scanQRPixels } from "qrdx";

// ── Module map ─────────────────────────────────────────────────────────────

/** What each module of a code is, for how strongly it's corrected. */
export const ModuleKind = {
  data: 0,
  /** Finder pattern plus its separator: 8 × 8 at three corners */
  finder: 1,
  alignment: 2,
  /** Format and version information */
  format: 3,
  timing: 4,
} as const;

export interface QRModuleMap {
  /** Modules across the code, without the quiet zone */
  size: number;
  /** 1 for a dark module, row by row */
  dark: Uint8Array;
  /** A ModuleKind per module, row by row */
  kinds: Uint8Array;
}

/** Row/column centers of the alignment patterns (ISO/IEC 18004, Annex E). */
function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step =
    version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let pos = size - 7; positions.length < count; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

/** The kind of every module of a code of `version` (exported for tests). */
export function moduleKinds(version: number): Uint8Array {
  const size = version * 4 + 17;
  const kinds = new Uint8Array(size * size);
  const fill = (x0: number, y0: number, w: number, h: number, kind: number) => {
    for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++) {
        kinds[y * size + x] = kind;
      }
    }
  };
  fill(6, 0, 1, size, ModuleKind.timing);
  fill(0, 6, size, 1, ModuleKind.timing);
  fill(0, 8, 9, 1, ModuleKind.format);
  fill(8, 0, 1, 9, ModuleKind.format);
  fill(size - 8, 8, 8, 1, ModuleKind.format);
  fill(8, size - 8, 1, 8, ModuleKind.format);
  if (version >= 7) {
    fill(size - 11, 0, 3, 6, ModuleKind.format);
    fill(0, size - 11, 6, 3, ModuleKind.format);
  }
  const positions = alignmentPositions(version, size);
  const last = positions.length - 1;
  for (const [i, cx] of positions.entries()) {
    for (const [j, cy] of positions.entries()) {
      const underFinder =
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0);
      if (!underFinder) fill(cx - 2, cy - 2, 5, 5, ModuleKind.alignment);
    }
  }
  fill(0, 0, 8, 8, ModuleKind.finder);
  fill(size - 8, 0, 8, 8, ModuleKind.finder);
  fill(0, size - 8, 8, 8, ModuleKind.finder);
  return kinds;
}

const luma = (r: number, g: number, b: number) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * The module map of a plain control code (dark on light, square modules),
 * read from its pixels at each module's center.
 */
export function readModuleMap(
  control: DecodedImage,
  modules: number,
  quietZone: number,
): QRModuleMap {
  const version = (modules - 17) / 4;
  if (!(Number.isInteger(version) && version >= 1 && version <= 40)) {
    throw new Error(`Not a QR code size: ${modules} modules`);
  }
  const pitch = control.width / (modules + 2 * quietZone);
  const dark = new Uint8Array(modules * modules);
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      const px = Math.floor((quietZone + x + 0.5) * pitch);
      const py = Math.floor((quietZone + y + 0.5) * pitch);
      const i = (py * control.width + px) * 4;
      dark[y * modules + x] =
        luma(
          control.data[i] as number,
          control.data[i + 1] as number,
          control.data[i + 2] as number,
        ) < 128
          ? 1
          : 0;
    }
  }
  return { size: modules, dark, kinds: moduleKinds(version) };
}

// ── Grid registration ──────────────────────────────────────────────────────

/** Where the code's modules are in an image, in pixels. */
export interface ModuleGrid {
  /** Top-left corner of the code (not of the quiet zone) */
  left: number;
  top: number;
  /** Module size */
  pitch: number;
  /**
   * How well the image's module centers follow the module map: the
   * correlation of their luma with it (1 = perfectly, 0 = not at all)
   */
  fit: number;
}

interface LumaIntegral {
  sums: Float64Array;
  width: number;
  height: number;
}

function lumaIntegral(pixels: DecodedImage): LumaIntegral {
  const { width, height, data } = pixels;
  const stride = width + 1;
  const sums = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      row += luma(
        data[i] as number,
        data[i + 1] as number,
        data[i + 2] as number,
      );
      sums[(y + 1) * stride + x + 1] =
        (sums[y * stride + x + 1] as number) + row;
    }
  }
  return { sums, width, height };
}

function boxMean(
  { sums, width, height }: LumaIntegral,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const stride = width + 1;
  const left = Math.max(0, Math.min(width, Math.round(x0)));
  const right = Math.max(0, Math.min(width, Math.round(x1)));
  const top = Math.max(0, Math.min(height, Math.round(y0)));
  const bottom = Math.max(0, Math.min(height, Math.round(y1)));
  if (right <= left || bottom <= top) return 128;
  return (
    ((sums[bottom * stride + right] as number) -
      (sums[top * stride + right] as number) -
      (sums[bottom * stride + left] as number) +
      (sums[top * stride + left] as number)) /
    ((right - left) * (bottom - top))
  );
}

/**
 * Correlation of each module's mean luma with "light" (−dark). The mean
 * covers 80% of the module, so a grid off by a fraction of a module mixes in
 * its neighbors and scores lower: the best fit is centered, not just close.
 */
function gridFit(
  integral: LumaIntegral,
  map: QRModuleMap,
  left: number,
  top: number,
  pitch: number,
): number {
  const { size, dark } = map;
  const r = pitch * 0.4;
  let sumB = 0;
  let sumV = 0;
  let sumBV = 0;
  let sumBB = 0;
  let sumVV = 0;
  const n = size * size;
  for (let y = 0; y < size; y++) {
    const cy = top + (y + 0.5) * pitch;
    for (let x = 0; x < size; x++) {
      const cx = left + (x + 0.5) * pitch;
      const v = boxMean(integral, cx - r, cy - r, cx + r, cy + r);
      const b = dark[y * size + x] as number;
      sumB += b;
      sumV += v;
      sumBV += b * v;
      sumBB += b * b;
      sumVV += v * v;
    }
  }
  const cov = sumBV - (sumB * sumV) / n;
  const varB = sumBB - (sumB * sumB) / n;
  const varV = sumVV - (sumV * sumV) / n;
  return -cov / Math.sqrt(varB * varV + 1e-9);
}

/**
 * Finds where the model drew the code: the module size and position whose
 * module centers best follow `map`, searched around `expected` (0.8 to 1.4
 * times the size, about ±3 modules in position). In the eval, GPT Image 2
 * redrew codes about 4% larger and Gemini 3.1 Flash Image about 30% larger,
 * out to the image's edges.
 */
export function locateGrid(
  pixels: DecodedImage,
  map: QRModuleMap,
  expected: Omit<ModuleGrid, "fit">,
): ModuleGrid {
  const integral = lumaIntegral(pixels);
  let best: ModuleGrid = {
    ...expected,
    fit: gridFit(integral, map, expected.left, expected.top, expected.pitch),
  };
  const consider = (left: number, top: number, pitch: number) => {
    const fit = gridFit(integral, map, left, top, pitch);
    if (fit > best.fit) best = { left, top, pitch, fit };
  };
  const center = {
    x: expected.left + (map.size * expected.pitch) / 2,
    y: expected.top + (map.size * expected.pitch) / 2,
  };
  const reach = expected.pitch * 3.2;
  const step = expected.pitch * 0.26;
  // A model that kept the grid needs only the fine pass.
  if (best.fit < 0.9) {
    for (let scale = 0.8; scale <= 1.4; scale += 0.015) {
      const pitch = expected.pitch * scale;
      const half = (map.size * pitch) / 2;
      for (let dx = -reach; dx <= reach; dx += step) {
        for (let dy = -reach; dy <= reach; dy += step) {
          consider(center.x - half + dx, center.y - half + dy, pitch);
        }
      }
    }
  }
  for (const [move, grow] of [
    [expected.pitch * 0.09, 0.004],
    [expected.pitch * 0.022, 0.001],
  ] as const) {
    const from = { ...best };
    for (let k = -3; k <= 3; k++) {
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          consider(
            from.left + dx * move,
            from.top + dy * move,
            from.pitch * (1 + k * grow),
          );
        }
      }
    }
  }
  return best;
}

// ── Correction ─────────────────────────────────────────────────────────────

const lerp = (from: number, to: number, t: number) =>
  from + (to - from) * Math.min(Math.max(t, 0), 1);

/**
 * Moves pixel `i` toward luma `limit` (0–255) by `weight`, only when it's on
 * the wrong side: darker by scaling (keeps the hue), lighter by mixing in
 * white.
 */
function push(
  data: Uint8Array,
  i: number,
  dark: boolean,
  limit: number,
  weight: number,
) {
  const r = data[i] as number;
  const g = data[i + 1] as number;
  const b = data[i + 2] as number;
  const l = luma(r, g, b);
  if (dark ? l <= limit : l >= limit) return;
  const target = l + (limit - l) * weight;
  if (dark) {
    const f = target / Math.max(l, 1e-6);
    data[i] = Math.round(r * f);
    data[i + 1] = Math.round(g * f);
    data[i + 2] = Math.round(b * f);
  } else {
    const k = (target - l) / Math.max(255 - l, 1e-6);
    data[i] = Math.round(r + (255 - r) * k);
    data[i + 1] = Math.round(g + (255 - g) * k);
    data[i + 2] = Math.round(b + (255 - b) * k);
  }
}

interface ModuleLimits {
  /** Dark modules' luma at most this (0–255), light ones at least `light` */
  dark: number;
  light: number;
  /** Share of the module side that's corrected, centered (1 = all of it) */
  cover: number;
}

/**
 * Where the finders, alignment patterns and quiet zone start, as a share of
 * their full correction, at the lowest strength. In the eval, zbarimg (an
 * independent decoder) read the corrected images only once these were at
 * full contrast, whatever the data modules' strength, so they start there:
 * the first thing strengthened is the code's structure.
 */
const ANCHOR_START = 1;

/** The limits for each kind of module at strength `s`. */
function limitsFor(s: number): {
  anchors: ModuleLimits;
  rest: ModuleLimits;
  quiet: number;
} {
  const sf = Math.min(1, ANCHOR_START + (1 - ANCHOR_START) * s * 2);
  return {
    anchors: {
      dark: 255 * lerp(0.45, 0.2, sf),
      light: 255 * lerp(0.55, 0.82, sf),
      cover: 1,
    },
    rest: {
      dark: 255 * lerp(0.5, 0.15, s),
      light: 255 * lerp(0.5, 0.85, s),
      cover: lerp(0.45, 1, s),
    },
    quiet: 255 * lerp(0.5, 0.85, sf),
  };
}

/** Light ring around the code, in modules, at full and fading strength. */
const QUIET_RING_FULL = 1.5;
const QUIET_RING_FADE = 2.5;

function correctModules(
  data: Uint8Array,
  width: number,
  height: number,
  map: QRModuleMap,
  grid: ModuleGrid,
  s: number,
) {
  const { size, dark, kinds } = map;
  const { pitch } = grid;
  const limits = limitsFor(s);
  const feather = Math.max(1, pitch * 0.08);
  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const kind = kinds[my * size + mx] as number;
      const anchor =
        kind === ModuleKind.finder || kind === ModuleKind.alignment;
      const {
        dark: darkMax,
        light: lightMin,
        cover,
      } = anchor ? limits.anchors : limits.rest;
      const isDark = dark[my * size + mx] === 1;
      const cx = grid.left + (mx + 0.5) * pitch;
      const cy = grid.top + (my + 0.5) * pitch;
      const half = (pitch * cover) / 2;
      const x0 = Math.max(0, Math.floor(cx - half - feather));
      const x1 = Math.min(width, Math.ceil(cx + half + feather));
      const y0 = Math.max(0, Math.floor(cy - half - feather));
      const y1 = Math.min(height, Math.ceil(cy + half + feather));
      for (let y = y0; y < y1; y++) {
        const dy = Math.abs(y + 0.5 - cy) - half;
        for (let x = x0; x < x1; x++) {
          const out = Math.max(Math.abs(x + 0.5 - cx) - half, dy);
          const weight = out <= 0 ? 1 : 1 - out / feather;
          if (weight > 0) {
            push(
              data,
              (y * width + x) * 4,
              isDark,
              isDark ? darkMax : lightMin,
              weight,
            );
          }
        }
      }
    }
  }
  // The quiet zone: light next to the code, fading into the scene.
  const ring = QUIET_RING_FADE * pitch;
  const right = grid.left + size * pitch;
  const bottom = grid.top + size * pitch;
  const x0 = Math.max(0, Math.floor(grid.left - ring));
  const x1 = Math.min(width, Math.ceil(right + ring));
  const y0 = Math.max(0, Math.floor(grid.top - ring));
  const y1 = Math.min(height, Math.ceil(bottom + ring));
  for (let y = y0; y < y1; y++) {
    const dy = Math.max(grid.top - (y + 0.5), y + 0.5 - bottom, 0);
    for (let x = x0; x < x1; x++) {
      const dx = Math.max(grid.left - (x + 0.5), x + 0.5 - right, 0);
      const d = Math.max(dx, dy) / pitch;
      if (d <= 0) continue;
      const weight =
        d <= QUIET_RING_FULL
          ? 1
          : Math.max(
              0,
              (QUIET_RING_FADE - d) / (QUIET_RING_FADE - QUIET_RING_FULL),
            );
      if (weight > 0)
        push(data, (y * width + x) * 4, false, limits.quiet, weight);
    }
  }
}

// jsQR's binarizer (ZXing's HybridBinarizer): 8 px blocks, each pixel
// compared with the mean of the 5 × 5 blocks around its block.
const BLOCK = 8;
const MIN_DYNAMIC_RANGE = 24;

function blockThresholds(grey: Float32Array, width: number, height: number) {
  const across = Math.ceil(width / BLOCK);
  const down = Math.ceil(height / BLOCK);
  const blackPoints = new Float32Array(across * down);
  for (let by = 0; by < down; by++) {
    for (let bx = 0; bx < across; bx++) {
      let sum = 0;
      let min = Number.POSITIVE_INFINITY;
      let max = 0;
      for (let y = 0; y < BLOCK; y++) {
        for (let x = 0; x < BLOCK; x++) {
          const px = bx * BLOCK + x;
          const py = by * BLOCK + y;
          const v =
            px < width && py < height ? (grey[py * width + px] as number) : 0;
          sum += v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      let average = sum / (BLOCK * BLOCK);
      if (max - min <= MIN_DYNAMIC_RANGE) {
        average = min / 2;
        if (by > 0 && bx > 0) {
          const neighbors =
            ((blackPoints[(by - 1) * across + bx] as number) +
              2 * (blackPoints[by * across + bx - 1] as number) +
              (blackPoints[(by - 1) * across + bx - 1] as number)) /
            4;
          if (min < neighbors) average = neighbors;
        }
      }
      blackPoints[by * across + bx] = average;
    }
  }
  const thresholds = new Float32Array(across * down);
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), hi);
  for (let by = 0; by < down; by++) {
    for (let bx = 0; bx < across; bx++) {
      const left = clamp(bx, 2, across - 3);
      const top = clamp(by, 2, down - 3);
      let sum = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          sum += blackPoints[(top + dy) * across + left + dx] as number;
        }
      }
      thresholds[by * across + bx] = sum / 25;
    }
  }
  return { thresholds, across };
}

/**
 * Nudges the pixels the binarizer would read wrong just across their
 * threshold (plus `margin`), a few passes since thresholds follow the pixels.
 * `want` per pixel: 1 dark, 2 light, 0 left alone.
 */
function cleanBinarization(
  data: Uint8Array,
  width: number,
  height: number,
  want: Uint8Array,
  box: { x0: number; y0: number; x1: number; y1: number },
  margin: number,
) {
  const grey = new Float32Array(width * height);
  for (let pass = 0; pass < 3; pass++) {
    for (let p = 0; p < width * height; p++) {
      grey[p] = luma(
        data[p * 4] as number,
        data[p * 4 + 1] as number,
        data[p * 4 + 2] as number,
      );
    }
    const { thresholds, across } = blockThresholds(grey, width, height);
    let changed = 0;
    for (let y = box.y0; y < box.y1; y++) {
      const row = Math.floor(y / BLOCK) * across;
      for (let x = box.x0; x < box.x1; x++) {
        const w = want[y * width + x];
        if (!w) continue;
        const t = thresholds[row + Math.floor(x / BLOCK)] as number;
        const l = grey[y * width + x] as number;
        if (w === 1 && l > t - margin) {
          push(data, (y * width + x) * 4, true, Math.max(0, t - margin), 1);
          changed++;
        } else if (w === 2 && l <= t + margin) {
          push(data, (y * width + x) * 4, false, Math.min(255, t + margin), 1);
          changed++;
        }
      }
    }
    if (changed === 0) break;
  }
}

/** Data modules join the binarizer cleaning from this strength on. */
const CLEAN_DATA_FROM = 0.7;
/** Quiet zone the binarizer cleaning covers, in modules. */
const CLEAN_QUIET_MODULES = 2;

/**
 * The model's image corrected at strength `s` (0–1) on `grid`. A new image;
 * `pixels` is left as it is.
 */
export function correctArt(
  pixels: DecodedImage,
  map: QRModuleMap,
  grid: ModuleGrid,
  s: number,
): DecodedImage {
  const { width, height } = pixels;
  const data = new Uint8Array(pixels.data);
  if (s <= 0) return { width, height, data };
  correctModules(data, width, height, map, grid, s);

  const { size, dark, kinds } = map;
  const { pitch } = grid;
  const q = CLEAN_QUIET_MODULES;
  const box = {
    x0: Math.max(0, Math.floor(grid.left - q * pitch)),
    y0: Math.max(0, Math.floor(grid.top - q * pitch)),
    x1: Math.min(width, Math.ceil(grid.left + (size + q) * pitch)),
    y1: Math.min(height, Math.ceil(grid.top + (size + q) * pitch)),
  };
  const withData = s >= CLEAN_DATA_FROM;
  const want = new Uint8Array(width * height);
  for (let y = box.y0; y < box.y1; y++) {
    const my = Math.floor((y + 0.5 - grid.top) / pitch);
    for (let x = box.x0; x < box.x1; x++) {
      const mx = Math.floor((x + 0.5 - grid.left) / pitch);
      if (mx < 0 || my < 0 || mx >= size || my >= size) {
        want[y * width + x] = 2;
        continue;
      }
      const m = my * size + mx;
      if (withData || kinds[m] !== ModuleKind.data) {
        want[y * width + x] = dark[m] ? 1 : 2;
      }
    }
  }
  cleanBinarization(data, width, height, want, box, lerp(8, 16, s));
  return { width, height, data };
}

// ── Search ─────────────────────────────────────────────────────────────────

export interface LeastBlendBounds {
  /** Lowest strength delivered (above 0, even an image that scans is corrected) */
  floor: number;
  /** Highest strength tried */
  cap: number;
  /** Whether the Image QR blend may follow when nothing up to `cap` scans */
  imageQRFallback: boolean;
}

/**
 * QR visibility (0–100) as the blend search's bounds. Up to the default (50)
 * the model's image is delivered untouched when it scans; above it, the code
 * is drawn more strongly even then (floor up to 0.6 at 100). Below 50 the
 * search stops early (0.6 at 0): a run that needs more fails, using no
 * credit, instead of covering the scene. The Image QR blend, which redraws
 * the whole image as a code, is the last resort from 50 up.
 */
export function leastBlendBounds(visibility: number): LeastBlendBounds {
  const v = Math.min(Math.max(visibility, 0), 100);
  return {
    floor: v <= 50 ? 0 : Math.round(((v - 50) / 50) * 0.6 * 100) / 100,
    cap: Math.min(1, Math.round((0.6 + (0.8 * v) / 100) * 100) / 100),
    imageQRFallback: v >= 50,
  };
}

/**
 * Code widths (px) the search's scan check reads through the camera model:
 * the delivery gate's own sizes plus a smaller one, so a delivered image
 * isn't merely on the edge of scanning.
 */
export const LEAST_BLEND_SCAN_SIZES: readonly number[] = [
  200,
  ...PIXEL_SCAN_SIZES,
];

/** Decodes `pixels` to `text` at these camera sizes (tests pass a fake). */
export type PixelScan = (
  pixels: DecodedImage,
  text: string,
  sizes: readonly number[],
) => Promise<boolean>;

export const scanPixels: PixelScan = async (pixels, text, sizes) =>
  (await scanQRPixels(pixels, text, { sizes })).passed;

/**
 * Lowest grid fit the least blend works from. Below it the model didn't draw
 * this code (in the eval: two Gemini 3.1 Flash images at 0.34 and 0.41, a
 * QR-like pattern of its own; every other image was 0.82 or more), and
 * strengthening it would paint a second code over the scene.
 */
export const MIN_GRID_FIT = 0.6;

/** Strengths tried, as a share of the floor-to-cap range, before bisecting. */
const LADDER = [0.05, 0.12, 0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1];
const BISECT_STEPS = 2;

export interface LeastBlend {
  pixels: DecodedImage;
  /** 0–1 */
  strength: number;
  grid: ModuleGrid;
  /** Strengths scan-checked */
  tries: number;
}

/**
 * The lowest strength in `bounds` whose corrected image passes `scan`, or
 * null (also, without scanning, when the model's grid fits worse than
 * MIN_GRID_FIT). Climbs a ladder of strengths, then bisects between the last
 * failure and the first success. Stops early at `deadline` (a Date.now()
 * time) or when `signal` aborts.
 */
export async function findLeastBlend({
  pixels,
  text,
  map,
  expected,
  bounds,
  scan = scanPixels,
  deadline = Number.POSITIVE_INFINITY,
  signal,
}: {
  pixels: DecodedImage;
  text: string;
  map: QRModuleMap;
  /** Where the control image has the code; the model's grid is found near it */
  expected: Omit<ModuleGrid, "fit">;
  bounds: LeastBlendBounds;
  scan?: PixelScan;
  deadline?: number;
  signal?: AbortSignal;
}): Promise<LeastBlend | null> {
  const grid = locateGrid(pixels, map, expected);
  if (grid.fit < MIN_GRID_FIT) return null;
  const { floor, cap } = bounds;
  let tries = 0;
  const attempt = async (strength: number) => {
    signal?.throwIfAborted();
    tries++;
    const corrected = correctArt(pixels, map, grid, strength);
    return (await scan(corrected, text, LEAST_BLEND_SCAN_SIZES))
      ? corrected
      : null;
  };
  const strengths = [
    ...(floor > 0 ? [floor] : []),
    ...LADDER.map((t) => floor + (cap - floor) * t),
  ].filter((s, i, all) => s > 0 && s <= cap && all.indexOf(s) === i);

  let below = floor;
  let found: { strength: number; pixels: DecodedImage } | null = null;
  for (const strength of strengths) {
    if (Date.now() > deadline) break;
    const corrected = await attempt(strength);
    if (corrected) {
      found = { strength, pixels: corrected };
      break;
    }
    below = strength;
  }
  if (!found) return null;
  let best: { strength: number; pixels: DecodedImage } = found;
  for (let step = 0; step < BISECT_STEPS; step++) {
    if (Date.now() > deadline) break;
    const mid: number = (below + best.strength) / 2;
    if (mid <= 0 || best.strength - mid < 0.01) break;
    const corrected = await attempt(mid);
    if (corrected) best = { strength: mid, pixels: corrected };
    else below = mid;
  }
  return {
    pixels: best.pixels,
    strength: Math.round(best.strength * 1000) / 1000,
    grid,
    tries,
  };
}

// ── PNG ────────────────────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * An opaque RGB PNG of `pixels` (alpha is dropped: the art is opaque), each
 * row with whichever filter makes it smallest.
 */
export function encodePng(pixels: DecodedImage): Uint8Array {
  const { width, height, data } = pixels;
  const rowBytes = width * 3;
  const raw = new Uint8Array((rowBytes + 1) * height);
  let previous = new Uint8Array(rowBytes);
  const current = new Uint8Array(rowBytes);
  const candidates = Array.from({ length: 5 }, () => new Uint8Array(rowBytes));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      current[x * 3] = data[i] as number;
      current[x * 3 + 1] = data[i + 1] as number;
      current[x * 3 + 2] = data[i + 2] as number;
    }
    let bestFilter = 0;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let filter = 0; filter < 5; filter++) {
      const out = candidates[filter] as Uint8Array;
      let cost = 0;
      for (let k = 0; k < rowBytes; k++) {
        const value = current[k] as number;
        const left = k >= 3 ? (current[k - 3] as number) : 0;
        const up = previous[k] as number;
        const upLeft = k >= 3 ? (previous[k - 3] as number) : 0;
        const predicted =
          filter === 0
            ? 0
            : filter === 1
              ? left
              : filter === 2
                ? up
                : filter === 3
                  ? (left + up) >> 1
                  : paeth(left, up, upLeft);
        const byte = (value - predicted) & 0xff;
        out[k] = byte;
        cost += byte < 128 ? byte : 256 - byte;
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestFilter = filter;
      }
    }
    raw[y * (rowBytes + 1)] = bestFilter;
    raw.set(candidates[bestFilter] as Uint8Array, y * (rowBytes + 1) + 1);
    previous = Uint8Array.from(current);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 6 }))),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}
