/** biome-ignore-all lint/style/noMagicNumbers: color math and module geometry */
// Art modes: Logo QR and Image QR, as plain vector shapes (no AI, no images),
// so SVG, PNG, PDF and EPS exports all look the same.
//
// Both modes rest on one scan model. A phone camera blurs the code by about
// a third of a module (σ ≈ 0.3) and its binarizer compares each module's
// center with the average of the modules around it. So every module gets a
// center dot in its true dark/light value, and the picture around the dot is
// left as it is wherever the blurred result already reads correctly; only
// modules that would read wrong are pushed toward dark or light, and only as
// far as needed. That keeps the picture faithful and every code scannable.
//
// - Logo QR, "blend": the logo, traced into crisp vector shapes, fills the
//   code under a dot screen (dark dots on dark modules, light dots on light
//   ones, skipped where the logo already gives the right tone).
// - Logo QR, "badge": the logo on a rounded plate in the middle, with modules
//   and eyes tinted in the logo's colors.
// - Image QR, "color": the photo at 3–4 sub-cells per module, luminance
//   adjusted per module where needed, under tinted center dots.
// - Image QR, "mono": Floyd–Steinberg halftone of the photo at 3 × 3
//   sub-cells per module, with each module's center sub-cell forced to its
//   value (after Chu et al., "Halftone QR Codes", SIGGRAPH Asia 2013).
// Finder, alignment and format patterns always stay crisp.
import type { JSX } from "react";
import {
  QR_ART_MAX_SAMPLE_SIZE,
  QR_ART_MODES,
  QR_ART_VARIANTS,
  type QRArt,
  type QRArtImage,
  type QRArtMode,
  type QRArtVariant,
} from "../types/art";
import type { Modules } from "../types/common";
import type { EyePosition } from "../types/qr";
import {
  type ArtBitmap,
  luma,
  type RGB,
  type TracedLogo,
  traceLogo,
} from "./art-trace";
import { parseColor } from "./utils/parse-color";

/** Intensity used when `art.intensity` is not set. */
export const DEFAULT_ART_INTENSITY = 0.6;

/**
 * Sample grid sizes `loadQRArtImage` uses per mode. 160 × 160 RGBA is about
 * 133 KB of base64, under the ~150 KB budget for art saved in themes.
 */
export const QR_ART_SAMPLE_SIZES: Record<QRArtMode, number> = {
  logo: 160,
  halftone: 160,
};

export interface QRArtPixels {
  /** RGBA bytes, row by row */
  data: ArrayLike<number>;
  width: number;
  height: number;
}

type DecodedArtImage = ArtBitmap;

// ── Encoding ───────────────────────────────────────────────────────────────

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x80_00;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Small LRU keyed by an image's base64 data. */
class ImageCache<T> {
  private readonly entries = new Map<string, T>();
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  get(key: string, create: () => T): T {
    const cached = this.entries.get(key);
    if (cached !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }
    const value = create();
    if (this.entries.size >= this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(key, value);
    return value;
  }
}

const decodedCache = new ImageCache<Uint8Array>(8);

function decodeBase64(data: string): Uint8Array {
  return decodedCache.get(data, () => {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  });
}

function decodeArtImage(image: QRArtImage): DecodedArtImage | null {
  const { width, height, data } = image;
  if (
    !(Number.isInteger(width) && Number.isInteger(height)) ||
    width < 1 ||
    height < 1 ||
    width > QR_ART_MAX_SAMPLE_SIZE ||
    height > QR_ART_MAX_SAMPLE_SIZE ||
    typeof data !== "string"
  ) {
    return null;
  }
  try {
    const bytes = decodeBase64(data);
    return bytes.length === width * height * 4
      ? { width, height, data: bytes }
      : null;
  } catch {
    return null;
  }
}

/**
 * Downsamples raw RGBA pixels (from a canvas, `sharp().raw()`, …) into the
 * compact bitmap `art.image` expects. Works everywhere, no DOM needed.
 * `square` crops the center square first (photos are drawn cover-fit, so
 * the crop keeps every stored pixel useful).
 */
export function createQRArtImage(
  pixels: QRArtPixels,
  options: { maxSize?: number; square?: boolean } = {}
): QRArtImage {
  const { width: fullWidth, height: fullHeight, data } = pixels;
  if (
    !(fullWidth > 0 && fullHeight > 0) ||
    data.length < fullWidth * fullHeight * 4
  ) {
    throw new Error("Art image pixels must be width × height × 4 RGBA bytes");
  }
  const side = Math.min(fullWidth, fullHeight);
  const left = options.square ? Math.floor((fullWidth - side) / 2) : 0;
  const top = options.square ? Math.floor((fullHeight - side) / 2) : 0;
  const sourceWidth = options.square ? side : fullWidth;
  const sourceHeight = options.square ? side : fullHeight;
  const maxSize = Math.min(
    Math.max(Math.round(options.maxSize ?? QR_ART_SAMPLE_SIZES.halftone), 1),
    QR_ART_MAX_SAMPLE_SIZE
  );
  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const out = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * sourceHeight) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sourceHeight) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * sourceWidth) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sourceWidth) / width));
      // Alpha-weighted box filter, so transparent pixels don't darken edges.
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = ((sy + top) * fullWidth + sx + left) * 4;
          const alpha = (data[i + 3] as number) / 255;
          r += (data[i] as number) * alpha;
          g += (data[i + 1] as number) * alpha;
          b += (data[i + 2] as number) * alpha;
          a += alpha;
          count++;
        }
      }
      const o = (y * width + x) * 4;
      out[o] = a > 0 ? Math.round(r / a) : 0;
      out[o + 1] = a > 0 ? Math.round(g / a) : 0;
      out[o + 2] = a > 0 ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / count) * 255);
    }
  }
  return { width, height, data: encodeBase64(out) };
}

async function toImageElement(
  source: string | Blob | HTMLImageElement
): Promise<HTMLImageElement> {
  if (typeof source !== "string" && !(source instanceof Blob)) {
    if (!source.complete) {
      await new Promise((resolve) => {
        source.addEventListener("load", resolve, { once: true });
        source.addEventListener("error", resolve, { once: true });
      });
    }
    return source;
  }
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load the art image"));
      img.src = url;
    });
  } finally {
    if (typeof source !== "string") {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

/**
 * Loads an image (data URL, same-origin URL, Blob or <img>) in the browser
 * and samples it for `art.image`. Use `createQRArtImage` on the server.
 * Photos (mode "halftone") are cropped to their center square.
 */
export async function loadQRArtImage(
  source: string | Blob | HTMLImageElement,
  options: { mode?: QRArtMode; maxSize?: number } = {}
): Promise<QRArtImage> {
  if (typeof document === "undefined") {
    throw new Error(
      "loadQRArtImage needs a browser; pass decoded pixels to createQRArtImage instead"
    );
  }
  const mode = options.mode ?? "halftone";
  const maxSize = options.maxSize ?? QR_ART_SAMPLE_SIZES[mode];
  const img = await toImageElement(source);
  const naturalWidth = img.naturalWidth || img.width || maxSize;
  const naturalHeight = img.naturalHeight || img.height || maxSize;
  const square = mode === "halftone";
  // Draw at up to 4× the target, then box-filter down for smooth sampling.
  const fit = Math.min(
    1,
    (maxSize * 4) /
      (square
        ? Math.min(naturalWidth, naturalHeight)
        : Math.max(naturalWidth, naturalHeight))
  );
  const width = Math.max(1, Math.round(naturalWidth * fit));
  const height = Math.max(1, Math.round(naturalHeight * fit));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Could not get a canvas context");
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  let pixels: ImageData;
  try {
    pixels = ctx.getImageData(0, 0, width, height);
  } catch {
    throw new Error(
      "Could not read the art image (cross-origin images need CORS); upload it instead"
    );
  } finally {
    canvas.remove();
  }
  return createQRArtImage(pixels, { maxSize, square });
}

/** True when `art` has a known mode and a well-formed image. */
export function isQRArtActive(art: QRArt | null | undefined): art is QRArt {
  return Boolean(
    art &&
      (QR_ART_MODES as readonly string[]).includes(art.mode) &&
      art.image &&
      decodeArtImage(art.image)
  );
}

/** The variant `art` renders with (the mode's default when unset or foreign). */
export function getQRArtVariant(
  art: Pick<QRArt, "mode" | "variant">
): QRArtVariant {
  const variants: readonly QRArtVariant[] = QR_ART_VARIANTS[art.mode];
  return art.variant && variants.includes(art.variant)
    ? art.variant
    : (variants[0] as QRArtVariant);
}

// ── Function patterns ──────────────────────────────────────────────────────

/** Row/column centers of the alignment patterns for a code of `version`. */
export function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) {
    return [];
  }
  const count = Math.floor(version / 7) + 2;
  const step =
    version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

/** Alignment pattern centers, without the three under the finders. */
function alignmentCenters(version: number, size: number): [number, number][] {
  const positions = alignmentPositions(version, size);
  const last = positions.length - 1;
  const centers: [number, number][] = [];
  for (const [i, cx] of positions.entries()) {
    for (const [j, cy] of positions.entries()) {
      if (
        !(
          (i === 0 && j === 0) ||
          (i === 0 && j === last) ||
          (i === last && j === 0)
        )
      ) {
        centers.push([cx, cy]);
      }
    }
  }
  return centers;
}

const KIND_DATA = 0;
/** Finder plus separator (8 × 8 at three corners); eyes are drawn there */
const KIND_FINDER = 1;
const KIND_ALIGNMENT = 2;
/** Format and version modules: drawn like data, but extra robust */
const KIND_STRONG = 3;
/** Timing patterns: decoders sample the grid without them, so drawn as data */
const KIND_TIMING = 4;

const kindsCache = new Map<number, Uint8Array>();

function moduleKinds(version: number): Uint8Array {
  const cached = kindsCache.get(version);
  if (cached) {
    return cached;
  }
  const size = version * 4 + 17;
  const kinds = new Uint8Array(size * size);
  const set = (x0: number, y0: number, w: number, h: number, kind: number) => {
    for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++) {
        kinds[y * size + x] = kind;
      }
    }
  };
  // Timing patterns, then format information
  set(6, 0, 1, size, KIND_TIMING);
  set(0, 6, size, 1, KIND_TIMING);
  set(0, 8, 9, 1, KIND_STRONG);
  set(8, 0, 1, 9, KIND_STRONG);
  set(size - 8, 8, 8, 1, KIND_STRONG);
  set(8, size - 8, 1, 8, KIND_STRONG);
  if (version >= 7) {
    set(size - 11, 0, 3, 6, KIND_STRONG);
    set(0, size - 11, 6, 3, KIND_STRONG);
  }
  for (const [cx, cy] of alignmentCenters(version, size)) {
    set(cx - 2, cy - 2, 5, 5, KIND_ALIGNMENT);
  }
  set(0, 0, 8, 8, KIND_FINDER);
  set(size - 8, 0, 8, 8, KIND_FINDER);
  set(0, size - 8, 8, 8, KIND_FINDER);
  kindsCache.set(version, kinds);
  return kinds;
}

/**
 * Modules that belong to function patterns (finders with separators, timing,
 * alignment, format and version information) for a code of `version`.
 */
export function getQRFunctionModules(version: number): boolean[][] {
  const size = version * 4 + 17;
  const kinds = moduleKinds(version);
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => kinds[y * size + x] !== KIND_DATA)
  );
}

type ErrorLevel = "L" | "M" | "Q" | "H";

/** Error correction level, read back from the code's format bits. */
function errorLevelOf(modules: Modules): ErrorLevel {
  const row = modules[8];
  // Format bits 14 and 13 hold the level, masked with 0b10.
  const high = row?.[0] ? 1 : 0;
  const low = row?.[1] ? 1 : 0;
  const bits = (1 - high) * 2 + low;
  return (["M", "L", "H", "Q"] as const)[bits] ?? "M";
}

// ── Color math (gamma-encoded sRGB, 0–1; luma as camera binarizers see it) ─

function rgbFrom(color: string, fallback: RGB): RGB {
  const parsed = parseColor(color);
  if (!parsed || parsed.a === 0) {
    return fallback;
  }
  return [parsed.r / 255, parsed.g / 255, parsed.b / 255];
}

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Moves `color` toward `anchor` just far enough to reach luma `target`
 * (darker: at most target; lighter: at least target). Mixing in gamma space
 * changes luma linearly and keeps the hue.
 */
function toward(color: RGB, anchor: RGB, target: number, darker: boolean) {
  const y = luma(color);
  if (darker ? y <= target : y >= target) {
    return color;
  }
  const ya = luma(anchor);
  if (Math.abs(y - ya) < 1e-6) {
    return anchor;
  }
  return mix(color, anchor, Math.min(1, Math.max(0, (y - target) / (y - ya))));
}

const chroma = (c: RGB) => Math.max(...c) - Math.min(...c);

const distance2 = (a: RGB, b: RGB) =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

const hexByte = (n: number) => n.toString(16).padStart(2, "0");

/** Hex color; `step` > 1 posterizes channels so similar colors share a path. */
function toHex(color: RGB, step = 1): string {
  const q = (value: number) =>
    Math.min(
      255,
      Math.round(Math.round(Math.min(Math.max(value, 0), 1) * 255) / step) *
        step
    );
  return `#${hexByte(q(color[0]))}${hexByte(q(color[1]))}${hexByte(q(color[2]))}`;
}

/** erf, Abramowitz & Stegun 7.1.26 (error < 1.5e-7) */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.327_591_1 * a);
  const y =
    1 -
    ((((1.061_405_429 * t - 1.453_152_027) * t + 1.421_413_741) * t -
      0.284_496_736) *
      t +
      0.254_829_592) *
      t *
      Math.exp(-a * a);
  return sign * y;
}

/** Camera blur in modules (σ), the scan model's main assumption */
const BLUR = 0.3;
/** Share of a blurred module center that comes from a centered dot */
const circleWeight = (diameter: number) =>
  1 - Math.exp(-((diameter / 2) ** 2) / (2 * BLUR ** 2));
const squareWeight = (side: number) =>
  erf(side / (2 * BLUR * Math.SQRT2)) ** 2;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// ── Sampling ───────────────────────────────────────────────────────────────

/** Maps module-space points (0…size) onto the art image. */
interface Placement {
  /** Modules per image pixel */
  scale: number;
  offsetX: number;
  offsetY: number;
}

function placement(
  width: number,
  height: number,
  box: number,
  fit: "contain" | "cover"
): Placement {
  const scale =
    fit === "cover"
      ? Math.max(box / width, box / height)
      : Math.min(box / width, box / height);
  return {
    scale,
    offsetX: (box - width * scale) / 2,
    offsetY: (box - height * scale) / 2,
  };
}

/** Float RGB + alpha copy of an art bitmap. */
interface FloatImage {
  width: number;
  height: number;
  rgb: Float32Array;
  alpha: Float32Array;
}

function toFloatImage(
  image: DecodedArtImage,
  alpha?: Float32Array
): FloatImage {
  const { width, height, data } = image;
  const rgb = new Float32Array(width * height * 3);
  const a = alpha ?? new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    rgb[p * 3] = data[p * 4] / 255;
    rgb[p * 3 + 1] = data[p * 4 + 1] / 255;
    rgb[p * 3 + 2] = data[p * 4 + 2] / 255;
    if (!alpha) {
      a[p] = data[p * 4 + 3] / 255;
    }
  }
  return { width, height, rgb, alpha: a };
}

/**
 * Photos: stretch luma to the 1st–99th percentile (at most 1.6×) and lift
 * saturation slightly, so hazy photos keep their contrast once the code's
 * dots sit on them.
 */
function toneMap(image: DecodedArtImage): FloatImage {
  const float = toFloatImage(image);
  const { rgb, alpha } = float;
  const histogram = new Float64Array(256);
  let total = 0;
  for (let p = 0; p < alpha.length; p++) {
    if (alpha[p] < 0.5) {
      continue;
    }
    const y = luma([rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]]);
    histogram[Math.min(255, Math.floor(y * 256))] += 1;
    total++;
  }
  const percentile = (share: number) => {
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += histogram[i];
      if (sum >= share * total) {
        return i / 255;
      }
    }
    return 1;
  };
  let lo = total ? percentile(0.01) : 0;
  let hi = total ? percentile(0.99) : 1;
  if (hi - lo < 0.15) {
    lo = 0;
    hi = 1;
  }
  const gain = Math.min(1.6, 1 / (hi - lo));
  const offset = (lo + hi) / 2;
  for (let p = 0; p < alpha.length; p++) {
    const c: RGB = [rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]];
    const y = luma(c);
    const stretched = 0.5 + (y - offset) * gain;
    for (let k = 0; k < 3; k++) {
      rgb[p * 3 + k] = Math.min(1, Math.max(0, stretched + (c[k] - y) * 1.12));
    }
  }
  return float;
}

/**
 * Bilinear color of `image` at image-space (x, y), composited over
 * `backdrop` (`strength` < 1 fades the image toward the backdrop).
 */
function sampleOver(
  image: FloatImage,
  x: number,
  y: number,
  backdrop: RGB,
  strength = 1
): RGB {
  const { width, height, rgb, alpha } = image;
  const fx = Math.min(Math.max(x - 0.5, 0), width - 1);
  const fy = Math.min(Math.max(y - 0.5, 0), height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  const add = (px: number, py: number, weight: number) => {
    const p = py * width + px;
    const w = alpha[p] * weight;
    r += rgb[p * 3] * w;
    g += rgb[p * 3 + 1] * w;
    b += rgb[p * 3 + 2] * w;
    a += w;
  };
  add(x0, y0, (1 - tx) * (1 - ty));
  add(x1, y0, tx * (1 - ty));
  add(x0, y1, (1 - tx) * ty);
  add(x1, y1, tx * ty);
  if (a <= 0) {
    return backdrop;
  }
  const k = a * strength;
  return [
    backdrop[0] + (r / a - backdrop[0]) * k,
    backdrop[1] + (g / a - backdrop[1]) * k,
    backdrop[2] + (b / a - backdrop[2]) * k,
  ];
}

const toneCache = new ImageCache<FloatImage>(4);
const traceCache = new ImageCache<TracedLogo>(6);
const logoPixelCache = new ImageCache<FloatImage>(6);

function tracedLogo(art: QRArt, image: DecodedArtImage): TracedLogo {
  return traceCache.get(art.image.data, () => traceLogo(image));
}

/** Logo pixels with the backdrop removed (the traced logo's opacity). */
function logoPixels(art: QRArt, image: DecodedArtImage, traced: TracedLogo) {
  return logoPixelCache.get(art.image.data, () =>
    toFloatImage(image, traced.alpha)
  );
}

// ── SVG building ───────────────────────────────────────────────────────────

const round = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

class PathGroups {
  private readonly groups = new Map<string, string[]>();

  add(color: string, segment: string) {
    const list = this.groups.get(color);
    if (list) {
      list.push(segment);
    } else {
      this.groups.set(color, [segment]);
    }
  }

  /** A run of `length` 1×1 cells starting at integer cell (x, y). */
  cellRun(color: string, x: number, y: number, length: number) {
    this.add(color, `M${x} ${y}h${length}.04v1.04h-${length}.04z`);
  }

  circle(color: string, cx: number, cy: number, r: number) {
    this.add(color, circlePath(cx, cy, r));
  }

  toElements(keyPrefix: string): JSX.Element[] {
    return [...this.groups].map(([color, segments], index) => (
      <path d={segments.join("")} fill={color} key={`${keyPrefix}-${index}`} />
    ));
  }
}

function circlePath(cx: number, cy: number, r: number) {
  const d = round(r * 2);
  const rr = round(r);
  return `M${round(cx - r)} ${round(cy)}a${rr} ${rr} 0 1 0 ${d} 0a${rr} ${rr} 0 1 0 ${-d} 0z`;
}

/** Rounded rectangle (clockwise). */
function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  const r = Math.min(radius, w / 2, h / 2);
  if (r <= 0) {
    return `M${round(x)} ${round(y)}h${round(w)}v${round(h)}h${round(-w)}z`;
  }
  const rr = round(r);
  return (
    `M${round(x + r)} ${round(y)}h${round(w - 2 * r)}a${rr} ${rr} 0 0 1 ${rr} ${rr}` +
    `v${round(h - 2 * r)}a${rr} ${rr} 0 0 1 ${-rr} ${rr}` +
    `h${round(-(w - 2 * r))}a${rr} ${rr} 0 0 1 ${-rr} ${-rr}` +
    `v${round(-(h - 2 * r))}a${rr} ${rr} 0 0 1 ${rr} ${-rr}z`
  );
}

/** Solid alignment patterns (5 × 5 ring and center), as one even-odd path. */
function alignmentPath(
  centers: [number, number][],
  margin: number,
  pixelSize: number
): string {
  let d = "";
  for (const [cx, cy] of centers) {
    const x = (cx - 2 + margin) * pixelSize;
    const y = (cy - 2 + margin) * pixelSize;
    d += roundedRectPath(x, y, 5 * pixelSize, 5 * pixelSize, pixelSize * 0.35);
    d += roundedRectPath(
      x + pixelSize,
      y + pixelSize,
      3 * pixelSize,
      3 * pixelSize,
      pixelSize * 0.15
    );
    d += roundedRectPath(
      x + 2 * pixelSize,
      y + 2 * pixelSize,
      pixelSize,
      pixelSize,
      pixelSize * 0.12
    );
  }
  return d;
}

// ── Rendering ──────────────────────────────────────────────────────────────

export interface QRArtRenderOptions {
  art: QRArt;
  /** Module grid without margin (after any logo excavation) */
  modules: Modules;
  /** QR version of `modules` (1–40) */
  version: number;
  margin: number;
  /** Width of one module in output units */
  pixelSize: number;
  /** Solid dark color (gradients: first stop) */
  fgColor: string;
  /** Solid light color (gradients: first stop) */
  bgColor: string;
  /**
   * Draws dark modules in the caller's body pattern (finder modules are
   * skipped by the caller). Logo "badge" uses it so the code keeps the
   * chosen dot shape; without it, art draws round dots.
   */
  body?: (modules: Modules) => JSX.Element | JSX.Element[] | null;
}

interface RenderContext {
  art: QRArt;
  image: DecodedArtImage;
  modules: Modules;
  size: number;
  version: number;
  kinds: Uint8Array;
  margin: number;
  pixelSize: number;
  /** Effective strength, 0–1 */
  t: number;
  fg: RGB;
  bg: RGB;
  variant: QRArtVariant;
  body?: QRArtRenderOptions["body"];
}

/**
 * Highest strength each variant renders with: past it the scan gate
 * (tests/art-quality.test.ts) starts failing, so stronger settings look the
 * same rather than stop scanning. Mono's dithered surroundings carry less
 * contrast than solid color, so it tops out earlier.
 */
const MAX_STRENGTH: Record<QRArtVariant, number> = {
  blend: 1,
  badge: 1,
  color: 0.9,
  mono: 0.7,
};

/** Strength actually used: 0 when colors are inverted or too close. */
function effectiveStrength(art: QRArt, fg: RGB, bg: RGB): number {
  const t = Math.min(
    Math.max(art.intensity ?? DEFAULT_ART_INTENSITY, 0),
    MAX_STRENGTH[getQRArtVariant(art)]
  );
  // Art needs dark modules on a light background with room in between;
  // otherwise keep the plain look so nothing gets worse.
  return luma(bg) - luma(fg) >= 0.35 ? t : 0;
}

function context(options: QRArtRenderOptions): RenderContext | null {
  const { art, modules, version } = options;
  const image = art.image && decodeArtImage(art.image);
  if (!(image && (QR_ART_MODES as readonly string[]).includes(art.mode))) {
    return null;
  }
  const size = modules.length;
  if (size !== version * 4 + 17) {
    return null;
  }
  const fg = rgbFrom(options.fgColor, [0, 0, 0]);
  const bg = rgbFrom(options.bgColor, [1, 1, 1]);
  const t = effectiveStrength(art, fg, bg);
  if (t <= 0) {
    return null;
  }
  return {
    art,
    image,
    modules,
    size,
    version,
    kinds: moduleKinds(version),
    margin: options.margin,
    pixelSize: options.pixelSize,
    t,
    fg,
    bg,
    variant: getQRArtVariant(art),
    body: options.body,
  };
}

/**
 * Draws every module that is not a finder eye in the art style. Returns null
 * when `art` is not usable (or its strength is 0), so callers fall back to
 * the normal body pattern.
 */
export function renderQRArt(options: QRArtRenderOptions): JSX.Element | null {
  const ctx = context(options);
  if (!ctx) {
    return null;
  }
  let content: JSX.Element[];
  if (ctx.art.mode === "halftone") {
    content =
      ctx.variant === "mono"
        ? renderMonoHalftone(ctx)
        : renderColorHalftone(ctx);
  } else {
    content =
      ctx.variant === "badge" ? renderLogoBadge(ctx) : renderLogoBlend(ctx);
  }
  return (
    <g data-qrdx-art={ctx.art.mode} data-qrdx-art-variant={ctx.variant}>
      {content}
    </g>
  );
}

// ── Image QR ───────────────────────────────────────────────────────────────

interface Cells {
  /** Sub-cells per module side */
  n: number;
  /** Sub-cells per code side */
  count: number;
  /** RGB per sub-cell; NaN where nothing is drawn (finders, alignment) */
  rgb: Float32Array;
}

/** Mono halftone parameters for strength t (lumas relative to fg…bg). */
function monoParams(t: number, n: number) {
  return {
    /**
     * Wanted margin between a module's blurred center and its surroundings;
     * dithered surroundings are noisy, and a 1-sub-cell core (n = 3) is
     * weaker than a 2 × 2 one, so they ask for more.
     */
    margin: 0.42 - 0.17 * t + (n === 3 ? 0.04 : 0),
    /**
     * Dark modules' surroundings never lighter than this, light ones never
     * darker than its mirror. Binarizers (jsQR, ZXing) treat low-range blocks
     * as flat, so large codes need absolute contrast, not just relative.
     */
    darkCap: 0.4 + 0.3 * t,
  };
}

/** How far the eye plates reach from the code's corners, in modules. */
const PLATE_REACH = 8.5;

const plateCache = new Map<number, Uint8Array>();

/**
 * Light "plates" that keep function patterns crisp on a picture: each eye's
 * finder and separator plus half of the next module ring, and each
 * alignment pattern plus a half-module halo. Data dots still draw on top.
 * Returns a test for module-space points (half-module resolution).
 */
function plates(version: number): (u: number, v: number) => boolean {
  const size = version * 4 + 17;
  let grid = plateCache.get(version);
  if (!grid) {
    const side = size * 2;
    const map = new Uint8Array(side * side);
    const reach = PLATE_REACH * 2;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const nearX = x < reach || x >= side - reach;
        const nearY = y < reach || y >= side - reach;
        if (nearX && nearY && !(x >= side - reach && y >= side - reach)) {
          map[y * side + x] = 1;
        }
      }
    }
    for (const [cx, cy] of alignmentCenters(version, size)) {
      for (let y = (cy - 2) * 2 - 1; y < (cy + 3) * 2 + 1; y++) {
        for (let x = (cx - 2) * 2 - 1; x < (cx + 3) * 2 + 1; x++) {
          if (x >= 0 && y >= 0 && x < side && y < side) {
            map[y * side + x] = 1;
          }
        }
      }
    }
    plateCache.set(version, map);
    grid = map;
  }
  const map = grid;
  const side = size * 2;
  return (u, v) => {
    const x = Math.floor(u * 2);
    const y = Math.floor(v * 2);
    return x >= 0 && y >= 0 && x < side && y < side && map[y * side + x] === 1;
  };
}

/** Samples the photo into sub-cells (cover fit, soft fade at the edge). */
function sampleCells(ctx: RenderContext, n: number, frosted = false): Cells {
  const { image, size, kinds, fg, bg } = ctx;
  const tone = toneCache.get(ctx.art.image.data, () => toneMap(image));
  const place = placement(image.width, image.height, size, "cover");
  const count = size * n;
  const rgb = new Float32Array(count * count * 3).fill(Number.NaN);
  const footprint = 1 / (n * place.scale);
  const taps = footprint > 1.3 ? 2 : 1;
  const frost = luma(bg) - 0.1 * (luma(bg) - luma(fg));
  const onPlate = plates(ctx.version);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const kind = kinds[y * size + x];
      const pattern = kind === KIND_FINDER || kind === KIND_ALIGNMENT;
      if (pattern && !frosted) {
        continue;
      }
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          let r = 0;
          let g = 0;
          let b = 0;
          for (let sy = 0; sy < taps; sy++) {
            for (let sx = 0; sx < taps; sx++) {
              const u = x + (i + (sx + 0.5) / taps) / n;
              const v = y + (j + (sy + 0.5) / taps) / n;
              const c = sampleOver(
                tone,
                (u - place.offsetX) / place.scale,
                (v - place.offsetY) / place.scale,
                bg
              );
              r += c[0];
              g += c[1];
              b += c[2];
            }
          }
          const samples = taps * taps;
          let color: RGB = [r / samples, g / samples, b / samples];
          // Soft quiet zone: the photo fades a little into the border.
          const u = x + (i + 0.5) / n;
          const v = y + (j + 0.5) / n;
          const edge = Math.min(u, v, size - u, size - v);
          if (edge < 1.5) {
            color = mix(color, bg, 0.35 * (1 - edge / 1.5));
          }
          if (frosted && (pattern || onPlate(u, v))) {
            // Frosted plate under eyes and alignment patterns
            color = toward(color, bg, frost, false);
          }
          const o = ((y * n + j) * count + x * n + i) * 3;
          rgb[o] = color[0];
          rgb[o + 1] = color[1];
          rgb[o + 2] = color[2];
        }
      }
    }
  }
  return { n, count, rgb };
}

/**
 * The scan model (see the file comment): pushes each module's surroundings
 * toward dark or light only where its blurred center would read wrong.
 * `weight` is the dot's share of the blurred center, `dark` / `light` the
 * dot lumas, and `under` marks sub-cells the dot hides.
 */
function enforceContrast(
  ctx: RenderContext,
  cells: Cells,
  dot: { weight: number; dark: number; light: number; under: boolean[] }
) {
  const { size, kinds, modules, fg, bg, t } = ctx;
  const { n, count, rgb } = cells;
  const yFg = luma(fg);
  const yBg = luma(bg);
  const range = yBg - yFg;
  const params = monoParams(t, n);
  const cellLuma = (o: number) =>
    0.2126 * rgb[o] + 0.7152 * rgb[o + 1] + 0.0722 * rgb[o + 2];
  // Mean luma per module (finders count as background, alignment as its
  // own pattern), for the 5 × 5 module neighbourhood average.
  const mean = new Float32Array(size * size);
  const surround = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const kind = kinds[y * size + x];
      if (kind === KIND_FINDER) {
        mean[y * size + x] = yBg;
        continue;
      }
      if (kind === KIND_ALIGNMENT) {
        mean[y * size + x] = modules[y]?.[x] ? yFg : yBg;
        continue;
      }
      let all = 0;
      let around = 0;
      let aroundCount = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const value = cellLuma(((y * n + j) * count + x * n + i) * 3);
          all += value;
          if (!dot.under[j * n + i]) {
            around += value;
            aroundCount++;
          }
        }
      }
      mean[y * size + x] = all / (n * n);
      surround[y * size + x] = aroundCount
        ? around / aroundCount
        : all / (n * n);
    }
  }
  const stride = size + 1;
  const sat = new Float64Array(stride * stride);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      sat[(y + 1) * stride + x + 1] =
        mean[y * size + x] +
        sat[y * stride + x + 1] +
        sat[(y + 1) * stride + x] -
        sat[y * stride + x];
    }
  }
  const reach = 2;
  const localMean = (x: number, y: number) => {
    const x0 = Math.max(0, x - reach);
    const y0 = Math.max(0, y - reach);
    const x1 = Math.min(size, x + reach + 1);
    const y1 = Math.min(size, y + reach + 1);
    const total =
      sat[y1 * stride + x1] -
      sat[y0 * stride + x1] -
      sat[y1 * stride + x0] +
      sat[y0 * stride + x0];
    return total / ((x1 - x0) * (y1 - y0));
  };
  const w = dot.weight;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const kind = kinds[y * size + x];
      if (kind === KIND_FINDER || kind === KIND_ALIGNMENT) {
        continue;
      }
      const strong = kind === KIND_STRONG;
      const margin = (params.margin + (strong ? 0.08 : 0)) * range;
      const cap = (params.darkCap - (strong ? 0.12 : 0)) * range;
      // Allowed offset of the surroundings from the local mean: positive
      // when the dot alone already gives enough contrast.
      const slack = (w * ((dot.light - dot.dark) / 2) - margin) / (1 - w);
      const local = localMean(x, y);
      const mu = surround[y * size + x];
      const dark = Boolean(modules[y]?.[x]);
      let k = 0;
      let anchor = bg;
      if (dark) {
        const limit = Math.min(local + slack, yFg + cap);
        if (mu > limit) {
          k = (mu - limit) / Math.max(mu - yFg, 1e-6);
          anchor = fg;
        }
      } else {
        const limit = Math.max(local - slack, yBg - cap);
        if (mu < limit) {
          k = (limit - mu) / Math.max(yBg - mu, 1e-6);
        }
      }
      if (k <= 0) {
        continue;
      }
      k = Math.min(1, k);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const o = ((y * n + j) * count + x * n + i) * 3;
          for (let c = 0; c < 3; c++) {
            rgb[o + c] += (anchor[c] - rgb[o + c]) * k;
          }
        }
      }
    }
  }
}

/** Run-length cell rows grouped by color, under one transform. */
function cellLayer(
  ctx: RenderContext,
  cells: Cells,
  colorOf: (cell: number) => string | null,
  key: string
): JSX.Element {
  const { count } = cells;
  const runs = new PathGroups();
  for (let row = 0; row < count; row++) {
    let start = 0;
    let current: string | null = colorOf(row * count);
    for (let col = 1; col <= count; col++) {
      const color = col < count ? colorOf(row * count + col) : null;
      if (col === count || color !== current) {
        if (current) {
          runs.cellRun(current, start, row, col - start);
        }
        start = col;
        current = color;
      }
    }
  }
  const cell = ctx.pixelSize / cells.n;
  const offset = round(ctx.margin * ctx.pixelSize);
  return (
    <g
      key={key}
      transform={`translate(${offset} ${offset}) scale(${round4(cell)})`}
    >
      {runs.toElements(key)}
    </g>
  );
}

function alignmentLayer(ctx: RenderContext, color: string): JSX.Element[] {
  const centers = alignmentCenters(ctx.version, ctx.size);
  if (centers.length === 0) {
    return [];
  }
  return [
    <path
      d={alignmentPath(centers, ctx.margin, ctx.pixelSize)}
      fill={color}
      fillRule="evenodd"
      key="art-alignment"
    />,
  ];
}

/** Sub-cells per module side: 4 when the sample has the detail for it. */
function subCells(ctx: RenderContext): number {
  const { image, size } = ctx;
  return Math.floor(Math.min(image.width, image.height) / size) >= 4 &&
    size <= 45
    ? 4
    : 3;
}

/** Inverse of `circleWeight`: the dot diameter that gives weight `w`. */
const diameterFor = (w: number) =>
  2 * BLUR * Math.sqrt(-2 * Math.log(1 - Math.min(w, 0.95)));

/** Box mean of a size × size grid over (2·reach+1)² cells, edges clamped. */
function boxMean(grid: Float32Array, size: number, reach: number) {
  const stride = size + 1;
  const sat = new Float64Array(stride * stride);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      sat[(y + 1) * stride + x + 1] =
        grid[y * size + x] +
        sat[y * stride + x + 1] +
        sat[(y + 1) * stride + x] -
        sat[y * stride + x];
    }
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const x0 = Math.max(0, x - reach);
      const y0 = Math.max(0, y - reach);
      const x1 = Math.min(size, x + reach + 1);
      const y1 = Math.min(size, y + reach + 1);
      out[y * size + x] =
        (sat[y1 * stride + x1] -
          sat[y0 * stride + x1] -
          sat[y1 * stride + x0] +
          sat[y0 * stride + x0]) /
        ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

interface DotRules {
  /** Smallest dot, for modules whose picture already reads right */
  base: number;
  /** Largest dot */
  max: number;
  /** Lumas of dark and light dots */
  dark: number;
  light: number;
  /** Wanted gap between a module's blurred center and the local mean */
  margin: number;
  /** Blurred dark centers at most yFg + cap, light ones at least yBg − cap */
  cap: number;
  /** Leave out dots the picture doesn't need (Logo QR at higher strength) */
  skip: boolean;
}

interface DotPlan {
  /** Per module; 0 = no dot */
  diameter: Float32Array;
  /** Surroundings' luma the module still needs (NaN: picture untouched) */
  surround: Float32Array;
}

/**
 * Amplitude-modulated dots from the scan model: every module gets the
 * smallest dot that makes its blurred center read right against its
 * neighbourhood, so dots stay small where the picture agrees with the code
 * and grow where it doesn't. Only when even the largest dot isn't enough is
 * the picture around it adjusted (`surround`).
 */
function planDots(
  ctx: RenderContext,
  mean: Float32Array,
  surround: Float32Array,
  rules: DotRules
): DotPlan {
  const { size, kinds, modules, fg, bg } = ctx;
  const yFg = luma(fg);
  const yBg = luma(bg);
  const range = yBg - yFg;
  const local = boxMean(mean, size, 2);
  const diameter = new Float32Array(size * size);
  const target = new Float32Array(size * size).fill(Number.NaN);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const m = y * size + x;
      const kind = kinds[m];
      if (kind === KIND_FINDER || kind === KIND_ALIGNMENT) {
        continue;
      }
      const strong = kind === KIND_STRONG;
      const base = rules.base + (strong ? 0.08 : 0);
      const margin = (rules.margin + (strong ? 0.03 : 0)) * range;
      const cap = (rules.cap - (strong ? 0.04 : 0)) * range;
      const wBase = circleWeight(base);
      const wMax = circleWeight(strong ? Math.max(rules.max, 0.94) : rules.max);
      // The rendered neighbourhood: the picture plus dots of both values.
      const localS =
        wBase * ((rules.dark + rules.light) / 2) + (1 - wBase) * local[m];
      const mu = surround[m];
      const dark = Boolean(modules[y]?.[x]);
      const dot = dark ? rules.dark : rules.light;
      const goal = dark
        ? Math.min(localS - margin, yFg + cap)
        : Math.max(localS + margin, yBg - cap);
      const agrees = dark ? mu <= goal : mu >= goal;
      let w = agrees ? 0 : (mu - goal) / (mu - dot);
      if (w > wMax) {
        w = wMax;
        target[m] = Math.min(
          yBg,
          Math.max(yFg, (goal - wMax * dot) / (1 - wMax))
        );
      }
      const clearly = dark ? mu <= goal - 0.06 : mu >= goal + 0.06;
      if (!(rules.skip && clearly && !strong)) {
        w = Math.max(w, wBase);
      }
      diameter[m] = w > 0 ? diameterFor(w) : 0;
    }
  }
  return { diameter, surround: target };
}

function renderColorHalftone(ctx: RenderContext): JSX.Element[] {
  const { size, kinds, modules, fg, bg, t, margin, pixelSize } = ctx;
  const n = subCells(ctx);
  const cells = sampleCells(ctx, n, true);
  const yFg = luma(fg);
  const yBg = luma(bg);
  const dotDark = yFg + 0.1 * (yBg - yFg);
  const dotLight = yBg - 0.05 * (yBg - yFg);
  const { count, rgb } = cells;
  const cellAt = (x: number, y: number, i: number, j: number) =>
    ((y * n + j) * count + x * n + i) * 3;

  // Module mean lumas (finders count as background, alignment as itself)
  const mean = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const kind = kinds[y * size + x];
      if (kind === KIND_FINDER || kind === KIND_ALIGNMENT) {
        mean[y * size + x] =
          kind === KIND_ALIGNMENT && modules[y]?.[x] ? yFg : yBg;
        continue;
      }
      let sum = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const o = cellAt(x, y, i, j);
          sum += 0.2126 * rgb[o] + 0.7152 * rgb[o + 1] + 0.0722 * rgb[o + 2];
        }
      }
      mean[y * size + x] = sum / (n * n);
    }
  }
  const plan = planDots(ctx, mean, mean, {
    base: 0.6 - 0.28 * t,
    max: 0.86,
    dark: dotDark,
    light: dotLight,
    margin: 0.2 - 0.1 * t,
    cap: 0.4 + 0.14 * t,
    skip: false,
  });

  // Where the biggest dot isn't enough, move the photo around it just as far
  // as needed (toward the dark or light color, keeping its hue).
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const goal = plan.surround[y * size + x];
      if (Number.isNaN(goal)) {
        continue;
      }
      const mu = mean[y * size + x];
      const darker = goal < mu;
      const anchor = darker ? fg : bg;
      const k = Math.min(
        1,
        Math.abs(mu - goal) / Math.max(Math.abs(mu - luma(anchor)), 1e-6)
      );
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const o = cellAt(x, y, i, j);
          for (let c = 0; c < 3; c++) {
            rgb[o + c] += (anchor[c] - rgb[o + c]) * k;
          }
        }
      }
    }
  }

  const layers: JSX.Element[] = [
    cellLayer(
      ctx,
      cells,
      (cell) => {
        const o = cell * 3;
        return Number.isNaN(rgb[o])
          ? null
          : toHex([rgb[o], rgb[o + 1], rgb[o + 2]], 8);
      },
      "art-photo"
    ),
  ];

  // Center dots, tinted with the module's own color.
  const dots = new PathGroups();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const diameter = plan.diameter[y * size + x];
      if (!(diameter > 0)) {
        continue;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const o = cellAt(x, y, i, j);
          r += rgb[o];
          g += rgb[o + 1];
          b += rgb[o + 2];
        }
      }
      const average: RGB = [r / (n * n), g / (n * n), b / (n * n)];
      const color = modules[y]?.[x]
        ? toward(average, fg, dotDark, true)
        : toward(average, bg, dotLight, false);
      dots.circle(
        toHex(color, 10),
        (x + margin + 0.5) * pixelSize,
        (y + margin + 0.5) * pixelSize,
        (diameter / 2) * pixelSize
      );
    }
  }
  layers.push(...dots.toElements("art-dot"), ...alignmentLayer(ctx, toHex(fg)));
  return layers;
}

function renderMonoHalftone(ctx: RenderContext): JSX.Element[] {
  const { size, kinds, modules, fg, bg } = ctx;
  const n = subCells(ctx);
  const cells = sampleCells(ctx, n);
  const yFg = luma(fg);
  const yBg = luma(bg);
  // The center sub-cell (3 × 3) or the center 2 × 2 (4 × 4) keeps the bit.
  const core = n % 2 === 1 ? 1 : 2;
  const lo = (n - core) / 2;
  const isCore = (i: number) => i >= lo && i < lo + core;
  const under: boolean[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      under.push(isCore(i) && isCore(j));
    }
  }
  enforceContrast(ctx, cells, {
    weight: squareWeight(core / n),
    dark: yFg,
    light: yBg,
    under,
  });
  const { count, rgb } = cells;
  // Floyd–Steinberg (serpentine) in fg…bg units, on a contrast curve that
  // keeps mid-tones from dissolving into noise; each module's core is forced
  // to its value and its error diffuses like any other.
  const value = new Float32Array(count * count);
  const forced = new Int8Array(count * count).fill(-1);
  for (let c = 0; c < count * count; c++) {
    const o = c * 3;
    if (Number.isNaN(rgb[o])) {
      value[c] = Number.NaN;
      continue;
    }
    const v =
      (0.2126 * rgb[o] + 0.7152 * rgb[o + 1] + 0.0722 * rgb[o + 2] - yFg) /
      (yBg - yFg);
    value[c] = 0.5 + (smoothstep(0, 1, v) - 0.5) * 1.15;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const kind = kinds[y * size + x];
      if (kind === KIND_FINDER || kind === KIND_ALIGNMENT) {
        continue;
      }
      for (let j = lo; j < lo + core; j++) {
        for (let i = lo; i < lo + core; i++) {
          forced[(y * n + j) * count + x * n + i] = modules[y]?.[x] ? 0 : 1;
        }
      }
    }
  }
  // Plates around eyes and alignment patterns stay light (cores excepted).
  const onPlate = plates(ctx.version);
  for (let cy = 0; cy < count; cy++) {
    for (let cx = 0; cx < count; cx++) {
      const c = cy * count + cx;
      if (forced[c] < 0 && onPlate((cx + 0.5) / n, (cy + 0.5) / n)) {
        forced[c] = 1;
      }
    }
  }
  const dark = new Uint8Array(count * count);
  // Error mostly stays inside its module, so one module's tone doesn't
  // leak into a neighbour of the opposite value.
  const CROSS_MODULE = 0.3;
  let fromX = 0;
  let fromY = 0;
  const push = (cx: number, cy: number, amount: number) => {
    if (cx < 0 || cx >= count || cy >= count) {
      return;
    }
    const c = cy * count + cx;
    if (!Number.isNaN(value[c])) {
      const same =
        Math.floor(cx / n) === Math.floor(fromX / n) &&
        Math.floor(cy / n) === Math.floor(fromY / n);
      value[c] += same ? amount : amount * CROSS_MODULE;
    }
  };
  for (let cy = 0; cy < count; cy++) {
    const dir = cy % 2 === 0 ? 1 : -1;
    for (let step = 0; step < count; step++) {
      const cx = dir === 1 ? step : count - 1 - step;
      const c = cy * count + cx;
      const old = value[c];
      if (Number.isNaN(old)) {
        continue;
      }
      const out = forced[c] >= 0 ? forced[c] : old >= 0.5 ? 1 : 0;
      dark[c] = out === 0 ? 1 : 0;
      const error = Math.min(0.75, Math.max(-0.75, old - out));
      fromX = cx;
      fromY = cy;
      push(cx + dir, cy, (error * 7) / 16);
      push(cx - dir, cy + 1, (error * 3) / 16);
      push(cx, cy + 1, (error * 5) / 16);
      push(cx + dir, cy + 1, error / 16);
    }
  }
  const fgHex = toHex(fg);
  return [
    cellLayer(ctx, cells, (cell) => (dark[cell] ? fgHex : null), "art-halftone"),
    ...alignmentLayer(ctx, fgHex),
  ];
}

// ── Logo QR ────────────────────────────────────────────────────────────────

/** Most brand-like palette color: large, saturated, not near-white. */
function primaryColor(traced: TracedLogo, avoid?: RGB): RGB | null {
  let best: RGB | null = null;
  let bestScore = 0;
  for (const entry of traced.palette) {
    if (avoid && distance2(entry.color, avoid) < 0.02) {
      continue;
    }
    const score =
      entry.area *
      (0.35 + chroma(entry.color)) *
      (luma(entry.color) > 0.86 ? 0.05 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = entry.color;
    }
  }
  return best;
}

/** Transform group that draws the traced logo into a box (output units). */
function logoGroup(
  traced: TracedLogo,
  logo: FloatImage,
  box: { x: number; y: number; scale: number },
  colorOf: (color: RGB) => RGB,
  key: string
): JSX.Element {
  let content: JSX.Element[];
  if (traced.photographic) {
    // Photos uploaded as logos: a fine mosaic of the sample itself.
    const runs = new PathGroups();
    const { width, height, rgb, alpha } = logo;
    for (let y = 0; y < height; y++) {
      let start = 0;
      let current: string | null = null;
      for (let x = 0; x <= width; x++) {
        const p = y * width + x;
        const color =
          x < width && alpha[p] >= 0.5
            ? toHex(colorOf([rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]]), 6)
            : null;
        if (x === width || color !== current) {
          if (current) {
            runs.cellRun(current, start, y, x - start);
          }
          start = x;
          current = color;
        }
      }
    }
    content = runs.toElements(`${key}-px`);
  } else {
    content = traced.layers.map((layer, index) => (
      <path
        d={layer.d}
        fill={toHex(colorOf(layer.color))}
        fillRule="evenodd"
        key={`${key}-${index}`}
      />
    ));
  }
  return (
    <g
      key={key}
      transform={`translate(${round(box.x)} ${round(box.y)}) scale(${round4(box.scale)})`}
    >
      {content}
    </g>
  );
}

function renderLogoBlend(ctx: RenderContext): JSX.Element[] {
  const { art, image, size, kinds, modules, fg, bg, t, margin, pixelSize } =
    ctx;
  const traced = tracedLogo(art, image);
  const logo = logoPixels(art, image, traced);
  const place = placement(traced.width, traced.height, size, "contain");
  // How strongly the logo shows: pastel at low strength, true color from 0.5.
  const fade = Math.min(1, 0.3 + 1.4 * t);
  const colorOf = (color: RGB) => mix(bg, color, fade);
  const bgHex = toHex(bg);
  const fgHex = toHex(fg);
  const layers: JSX.Element[] = [
    logoGroup(
      traced,
      logo,
      {
        x: (margin + place.offsetX) * pixelSize,
        y: (margin + place.offsetY) * pixelSize,
        scale: place.scale * pixelSize,
      },
      colorOf,
      "art-logo"
    ),
  ];

  // Clean plates under the three eyes: finder, separator and half the next
  // ring of modules (their dots still draw on top), so a dark logo next to
  // an eye can't swallow the separator at small sizes. The outer corners
  // round off in the quiet zone.
  const reach = PLATE_REACH;
  const plate = (x: number, y: number) =>
    roundedRectPath(
      (x + margin) * pixelSize,
      (y + margin) * pixelSize,
      (reach + 0.4) * pixelSize,
      (reach + 0.4) * pixelSize,
      1.2 * pixelSize
    );
  // Alignment patterns get a half-module halo of background too.
  const halos = alignmentCenters(ctx.version, size)
    .map(([cx, cy]) =>
      roundedRectPath(
        (cx - 2.5 + margin) * pixelSize,
        (cy - 2.5 + margin) * pixelSize,
        6 * pixelSize,
        6 * pixelSize,
        pixelSize * 0.8
      )
    )
    .join("");
  layers.push(
    <path
      d={
        plate(-0.4, -0.4) +
        plate(size - reach, -0.4) +
        plate(-0.4, size - reach) +
        halos
      }
      fill={bgHex}
      key="art-plates"
    />
  );
  const onPlate = plates(ctx.version);

  // Dot screen: dark dots on dark modules, light dots on light ones, each
  // as small as the scan model allows (see planDots); at higher strength,
  // dots the logo doesn't need are left out.
  const yBg = luma(bg);
  const yFg = luma(fg);
  const mean = new Float32Array(size * size);
  const lowest = new Float32Array(size * size);
  const average: RGB[] = new Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const m = y * size + x;
      const kind = kinds[m];
      if (kind === KIND_FINDER || kind === KIND_ALIGNMENT) {
        mean[m] = kind === KIND_ALIGNMENT && modules[y]?.[x] ? yFg : yBg;
        continue;
      }
      let lo = 1;
      let sum = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const u = x + (i + 0.5) / 4;
          const v = y + (j + 0.5) / 4;
          const c = onPlate(u, v)
            ? bg
            : sampleOver(
                logo,
                (u - place.offsetX) / place.scale,
                (v - place.offsetY) / place.scale,
                bg,
                fade
              );
          const value = luma(c);
          lo = Math.min(lo, value);
          sum += value;
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      mean[m] = sum / 16;
      lowest[m] = lo;
      average[m] = [r / 16, g / 16, b / 16];
    }
  }
  const dotDark = yFg + 0.08 * (yBg - yFg);
  const dotLight = yBg - 0.04 * (yBg - yFg);
  const plan = planDots(ctx, mean, mean, {
    base: 0.74 - 0.26 * t,
    max: 0.9,
    dark: dotDark,
    light: dotLight,
    margin: 0.23 - 0.1 * t,
    cap: 0.4 + 0.1 * t,
    skip: t >= 0.7,
  });
  const dots = new PathGroups();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const m = y * size + x;
      const diameter = plan.diameter[m];
      const dark = Boolean(modules[y]?.[x]);
      // Light dots on plain background would be invisible.
      if (!(diameter > 0) || (!dark && lowest[m] >= yBg - 0.02)) {
        continue;
      }
      // Dots take a deep (or pale) shade of the logo color under them.
      const color = dark
        ? toward(average[m] as RGB, fg, dotDark, true)
        : toward(average[m] as RGB, bg, dotLight, false);
      dots.circle(
        toHex(color, 8),
        (x + margin + 0.5) * pixelSize,
        (y + margin + 0.5) * pixelSize,
        (diameter / 2) * pixelSize
      );
    }
  }
  layers.push(...dots.toElements("art-dot"));
  layers.push(...alignmentLayer(ctx, fgHex));
  return layers;
}

/** EC capacity relative to H, for sizing the badge. */
const BADGE_LEVEL_SCALE: Record<ErrorLevel, number> = {
  L: 0.5,
  M: 0.72,
  Q: 0.88,
  H: 1,
};

/** Badge geometry in modules: logo box and the plate around it. */
function badgeLayout(ctx: RenderContext, traced: TracedLogo) {
  const { size, t, modules } = ctx;
  const share = (0.18 + 0.15 * t) * BADGE_LEVEL_SCALE[errorLevelOf(modules)];
  const box = Math.min(0.32, share) * size;
  const aspect = traced.width / traced.height;
  const logoW = aspect >= 1 ? box : box * aspect;
  const logoH = aspect >= 1 ? box / aspect : box;
  const pad = Math.max(0.7, box * 0.09);
  const plateW = logoW + 2 * pad;
  const plateH = logoH + 2 * pad;
  return {
    logoW,
    logoH,
    plateW,
    plateH,
    radius: Math.min(plateW, plateH) * 0.26,
    cx: size / 2,
    cy: size / 2,
  };
}

/** Signed distance from (px, py) to a centered rounded rectangle. */
function roundedRectDistance(
  px: number,
  py: number,
  rect: { cx: number; cy: number; w: number; h: number; r: number }
) {
  const qx = Math.abs(px - rect.cx) - (rect.w / 2 - rect.r);
  const qy = Math.abs(py - rect.cy) - (rect.h / 2 - rect.r);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    rect.r
  );
}

/** Body and eye-center colors of a badge code: the logo's colors, kept dark. */
function badgeColors(
  ctx: Pick<RenderContext, "fg" | "bg" | "t">,
  traced: TracedLogo
) {
  const { fg, bg, t } = ctx;
  const yFg = luma(fg);
  const yBg = luma(bg);
  const primary = primaryColor(traced);
  const tint = Math.min(1, t / 0.6);
  const capped = primary
    ? toward(primary, fg, yFg + 0.3 * (yBg - yFg), true)
    : fg;
  const body = mix(fg, capped, tint);
  // The accent colors the eye centers only if it stays itself once darkened
  // enough to scan (a pale accent would turn muddy).
  const accent = primary ? primaryColor(traced, primary) : null;
  const accentTarget = yFg + 0.42 * (yBg - yFg);
  const inner =
    accent && luma(accent) <= accentTarget + 0.22
      ? mix(fg, toward(accent, fg, accentTarget, true), tint)
      : body;
  return { body, inner };
}

function renderLogoBadge(ctx: RenderContext): JSX.Element[] {
  const { art, image, size, kinds, modules, bg, margin, pixelSize, version } =
    ctx;
  const traced = tracedLogo(art, image);
  const logo = logoPixels(art, image, traced);
  const layout = badgeLayout(ctx, traced);
  const { body } = badgeColors(ctx, traced);
  const bodyHex = toHex(body);
  const rect = {
    cx: layout.cx,
    cy: layout.cy,
    w: layout.plateW,
    h: layout.plateH,
    r: layout.radius,
  };
  // Clear every module whose dot would touch the plate, plus alignment
  // patterns (drawn solid below, or dropped when the plate covers them).
  const cleared = modules.map((row) => [...row]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const kind = kinds[y * size + x];
      if (
        kind === KIND_ALIGNMENT ||
        (kind !== KIND_FINDER &&
          roundedRectDistance(x + 0.5, y + 0.5, rect) < 0.55)
      ) {
        (cleared[y] as boolean[])[x] = false;
      }
    }
  }
  const layers: JSX.Element[] = [];
  const drawn = ctx.body?.(cleared);
  if (drawn) {
    layers.push(
      <g fill={bodyHex} key="art-body">
        {drawn}
      </g>
    );
  } else {
    const dots = new PathGroups();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (cleared[y]?.[x] && kinds[y * size + x] !== KIND_FINDER) {
          dots.circle(
            bodyHex,
            (x + margin + 0.5) * pixelSize,
            (y + margin + 0.5) * pixelSize,
            0.45 * pixelSize
          );
        }
      }
    }
    layers.push(...dots.toElements("art-body"));
  }
  const visibleAlignment = alignmentCenters(version, size).filter(
    ([cx, cy]) => roundedRectDistance(cx + 0.5, cy + 0.5, rect) > 3.2
  );
  if (visibleAlignment.length > 0) {
    layers.push(
      <path
        d={alignmentPath(visibleAlignment, margin, pixelSize)}
        fill={bodyHex}
        fillRule="evenodd"
        key="art-alignment"
      />
    );
  }
  // Plate: background color with a hairline ring in a tint of the logo.
  const plateX = (layout.cx - layout.plateW / 2 + margin) * pixelSize;
  const plateY = (layout.cy - layout.plateH / 2 + margin) * pixelSize;
  const plateW = layout.plateW * pixelSize;
  const plateH = layout.plateH * pixelSize;
  const radius = layout.radius * pixelSize;
  const ring = 0.1 * pixelSize;
  const outline = roundedRectPath(plateX, plateY, plateW, plateH, radius);
  layers.push(
    <path d={outline} fill={toHex(bg)} key="art-plate" />,
    <path
      d={
        outline +
        roundedRectPath(
          plateX + ring,
          plateY + ring,
          plateW - 2 * ring,
          plateH - 2 * ring,
          radius - ring
        )
      }
      fill={toHex(mix(bg, body, 0.16))}
      fillRule="evenodd"
      key="art-plate-ring"
    />,
    logoGroup(
      traced,
      logo,
      {
        x: (layout.cx - layout.logoW / 2 + margin) * pixelSize,
        y: (layout.cy - layout.logoH / 2 + margin) * pixelSize,
        scale: (layout.logoW / traced.width) * pixelSize,
      },
      (color) => color,
      "art-logo"
    )
  );
  return layers;
}

// ── Eyes ───────────────────────────────────────────────────────────────────

export interface QRArtEyeColorOptions {
  art: QRArt;
  /** QR version (1–40) */
  version: number;
  /** Solid dark color (gradients: first stop) */
  fgColor: string;
  /** Solid light color (gradients: first stop) */
  bgColor: string;
}

/**
 * Logo QR: eye colors that match the logo, or null to keep the theme's.
 * "blend" colors each eye's center from the logo color nearest to it (the
 * frames keep the theme color); "badge" uses the logo's brand color for the
 * frames and its accent for the centers. Colors stay dark enough to scan.
 */
export function getQRArtEyeColors(
  options: QRArtEyeColorOptions
): Partial<Record<EyePosition, { outer?: string; inner?: string }>> | null {
  const { art } = options;
  if (art.mode !== "logo" || art.matchEyes === false) {
    return null;
  }
  const image = art.image && decodeArtImage(art.image);
  if (!image) {
    return null;
  }
  const fg = rgbFrom(options.fgColor, [0, 0, 0]);
  const bg = rgbFrom(options.bgColor, [1, 1, 1]);
  const t = effectiveStrength(art, fg, bg);
  if (t <= 0) {
    return null;
  }
  const traced = tracedLogo(art, image);
  if (traced.palette.length === 0) {
    return null;
  }
  if (getQRArtVariant(art) === "badge") {
    const { body, inner } = badgeColors({ fg, bg, t }, traced);
    const colors = { outer: toHex(body), inner: toHex(inner) };
    return { topLeft: colors, topRight: colors, bottomLeft: colors };
  }
  const yFg = luma(fg);
  const yBg = luma(bg);
  const tint = Math.min(1, t / 0.6);
  const size = options.version * 4 + 17;
  const place = placement(traced.width, traced.height, size, "contain");
  const reach = 0.45 * Math.max(traced.width, traced.height);
  const eye = (mx: number, my: number) => {
    const ex = (mx - place.offsetX) / place.scale;
    const ey = (my - place.offsetY) / place.scale;
    let best: RGB | null = null;
    let bestScore = 0;
    for (const entry of traced.palette) {
      if (luma(entry.color) > 0.86) {
        continue;
      }
      const d2 = (entry.cx - ex) ** 2 + (entry.cy - ey) ** 2;
      const score =
        entry.area *
        (0.35 + chroma(entry.color)) *
        Math.exp(-d2 / (2 * reach ** 2));
      if (score > bestScore) {
        bestScore = score;
        best = entry.color;
      }
    }
    if (!best) {
      return {};
    }
    const capped = toward(best, fg, yFg + 0.42 * (yBg - yFg), true);
    return { inner: toHex(mix(fg, capped, tint)) };
  };
  return {
    topLeft: eye(3.5, 3.5),
    topRight: eye(size - 3.5, 3.5),
    bottomLeft: eye(3.5, size - 3.5),
  };
}
