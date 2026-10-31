/** biome-ignore-all lint/style/noMagicNumbers: color math and module geometry */
import type { JSX } from "react";
import {
  QR_ART_MAX_SAMPLE_SIZE,
  QR_ART_MODES,
  type QRArt,
  type QRArtImage,
  type QRArtMode,
} from "../types/art";
import type { Modules } from "../types/common";
import { parseColor } from "./utils/parse-color";

/** Intensity used when `art.intensity` is not set. */
export const DEFAULT_ART_INTENSITY = 0.6;

/** Sample grid sizes `loadQRArtImage` uses per mode (logos need less detail). */
export const QR_ART_SAMPLE_SIZES: Record<QRArtMode, number> = {
  logo: 64,
  halftone: 96,
};

export interface QRArtPixels {
  /** RGBA bytes, row by row */
  data: ArrayLike<number>;
  width: number;
  height: number;
}

interface DecodedArtImage {
  width: number;
  height: number;
  data: Uint8Array;
}

// ── Encoding ───────────────────────────────────────────────────────────────

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x80_00;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const decodedCache = new Map<string, Uint8Array>();
const DECODED_CACHE_SIZE = 8;

function decodeBase64(data: string): Uint8Array {
  const cached = decodedCache.get(data);
  if (cached) {
    return cached;
  }
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  if (decodedCache.size >= DECODED_CACHE_SIZE) {
    const oldest = decodedCache.keys().next().value;
    if (oldest !== undefined) {
      decodedCache.delete(oldest);
    }
  }
  decodedCache.set(data, bytes);
  return bytes;
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
 */
export function createQRArtImage(
  pixels: QRArtPixels,
  options: { maxSize?: number } = {}
): QRArtImage {
  const { width: sourceWidth, height: sourceHeight, data } = pixels;
  if (
    !(sourceWidth > 0 && sourceHeight > 0) ||
    data.length < sourceWidth * sourceHeight * 4
  ) {
    throw new Error("Art image pixels must be width × height × 4 RGBA bytes");
  }
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
          const i = (sy * sourceWidth + sx) * 4;
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
  const maxSize =
    options.maxSize ?? QR_ART_SAMPLE_SIZES[options.mode ?? "halftone"];
  const img = await toImageElement(source);
  const naturalWidth = img.naturalWidth || img.width || maxSize;
  const naturalHeight = img.naturalHeight || img.height || maxSize;
  // Draw at up to 4× the target, then box-filter down for smooth sampling.
  const fit = Math.min(
    1,
    (maxSize * 4) / Math.max(naturalWidth, naturalHeight)
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
  return createQRArtImage(pixels, { maxSize });
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

// ── Function patterns ──────────────────────────────────────────────────────

function alignmentPositions(version: number, size: number): number[] {
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

/**
 * Modules that belong to function patterns (finders with separators, timing,
 * alignment, format and version information) for a code of `version`.
 */
export function getQRFunctionModules(version: number): boolean[][] {
  const size = version * 4 + 17;
  const mask = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false)
  );
  const mark = (x0: number, y0: number, w: number, h: number) => {
    for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++) {
      const row = mask[y] as boolean[];
      for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++) {
        row[x] = true;
      }
    }
  };
  // Finders, separators and format information
  mark(0, 0, 9, 9);
  mark(size - 8, 0, 8, 9);
  mark(0, size - 8, 9, 8);
  // Timing patterns
  mark(6, 0, 1, size);
  mark(0, 6, size, 1);
  // Alignment patterns (not on the finder corners)
  const positions = alignmentPositions(version, size);
  const last = positions.length - 1;
  for (const [i, cx] of positions.entries()) {
    for (const [j, cy] of positions.entries()) {
      if (
        !(
          (i === 0 && j === 0) ||
          (i === 0 && j === last) ||
          (i === last && j === 0)
        )
      ) {
        mark(cx - 2, cy - 2, 5, 5);
      }
    }
  }
  // Version information
  if (version >= 7) {
    mark(size - 11, 0, 3, 6);
    mark(0, size - 11, 6, 3);
  }
  return mask;
}

/** The 7×7 finder squares, which QRCodeSVG draws as styled eyes. */
function isFinderModule(x: number, y: number, size: number): boolean {
  return (
    (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7)
  );
}

// ── Color math (linear RGB) ────────────────────────────────────────────────

type Linear = [number, number, number];

const toLinear = (channel: number) => {
  const v = channel / 255;
  return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const toSrgb = (value: number) => {
  const v = Math.min(Math.max(value, 0), 1);
  const c = v <= 0.003_130_8 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(c * 255);
};

const luminance = ([r, g, b]: Linear) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function linearFromHex(color: string, fallback: Linear): Linear {
  const parsed = parseColor(color);
  if (!parsed || parsed.a === 0) {
    return fallback;
  }
  return [toLinear(parsed.r), toLinear(parsed.g), toLinear(parsed.b)];
}

/** Darkens (keeping the hue) until luminance is at most `max`. */
function capLuminance(color: Linear, max: number): Linear {
  const y = luminance(color);
  if (y <= max || y === 0) {
    return color;
  }
  const k = max / y;
  return [color[0] * k, color[1] * k, color[2] * k];
}

/** Lightens towards white (keeping the hue) until luminance is at least `min`. */
function floorLuminance(color: Linear, min: number): Linear {
  const y = luminance(color);
  if (y >= min || y >= 1) {
    return color;
  }
  const k = (1 - min) / (1 - y);
  return [
    1 - (1 - color[0]) * k,
    1 - (1 - color[1]) * k,
    1 - (1 - color[2]) * k,
  ];
}

const mix = (a: Linear, b: Linear, t: number): Linear => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const hex = (n: number) => n.toString(16).padStart(2, "0");

/** sRGB hex; `step` > 1 posterizes channels so similar colors share a path. */
function toHex(color: Linear, step = 1): string {
  const q = (value: number) =>
    Math.min(255, Math.round(toSrgb(value) / step) * step);
  return `#${hex(q(color[0]))}${hex(q(color[1]))}${hex(q(color[2]))}`;
}

// ── Sampling ───────────────────────────────────────────────────────────────

interface Sample {
  color: Linear;
  /** 0–1 */
  alpha: number;
}

/** Maps module-space points (0…n) onto the art image. */
interface Placement {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function placement(
  image: DecodedArtImage,
  modules: number,
  fit: "contain" | "cover"
): Placement {
  const scale =
    fit === "cover"
      ? Math.max(modules / image.width, modules / image.height)
      : Math.min(modules / image.width, modules / image.height);
  return {
    scale,
    offsetX: (modules - image.width * scale) / 2,
    offsetY: (modules - image.height * scale) / 2,
  };
}

function samplePixel(
  image: DecodedArtImage,
  place: Placement,
  u: number,
  v: number,
  clampEdges: boolean
): Sample {
  let x = (u - place.offsetX) / place.scale - 0.5;
  let y = (v - place.offsetY) / place.scale - 0.5;
  const { width, height, data } = image;
  if (
    !clampEdges &&
    (x < -0.5 || y < -0.5 || x > width - 0.5 || y > height - 0.5)
  ) {
    return { color: [0, 0, 0], alpha: 0 };
  }
  x = Math.min(Math.max(x, 0), width - 1);
  y = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  const add = (px: number, py: number, weight: number) => {
    const i = (py * width + px) * 4;
    const alpha = ((data[i + 3] as number) / 255) * weight;
    r += toLinear(data[i] as number) * alpha;
    g += toLinear(data[i + 1] as number) * alpha;
    b += toLinear(data[i + 2] as number) * alpha;
    a += alpha;
  };
  add(x0, y0, (1 - fx) * (1 - fy));
  add(x1, y0, fx * (1 - fy));
  add(x0, y1, (1 - fx) * fy);
  add(x1, y1, fx * fy);
  return a > 0
    ? { color: [r / a, g / a, b / a], alpha: a }
    : { color: [0, 0, 0], alpha: 0 };
}

/**
 * Logos saved as JPEG (or with a solid backdrop) have no transparency: when
 * the four corners share one opaque color, treat that color as background.
 */
function backdropColor(image: DecodedArtImage): Linear | null {
  const { width, height, data } = image;
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].map(
    (index) => {
      const i = index * 4;
      return {
        color: [
          toLinear(data[i] as number),
          toLinear(data[i + 1] as number),
          toLinear(data[i + 2] as number),
        ] as Linear,
        alpha: (data[i + 3] as number) / 255,
      };
    }
  );
  if (corners.some((corner) => corner.alpha < 0.9)) {
    return null;
  }
  const first = (corners[0] as Sample).color;
  const similar = corners.every(
    ({ color }) => colorDistance(color, first) < 0.08
  );
  return similar ? first : null;
}

const colorDistance = (a: Linear, b: Linear) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ── Rendering ──────────────────────────────────────────────────────────────

const round = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

class PathGroups {
  private readonly groups = new Map<string, string[]>();

  rect(color: string, x: number, y: number, w: number, h: number) {
    this.push(
      color,
      `M${round(x)} ${round(y)}h${round(w)}v${round(h)}h${round(-w)}z`
    );
  }

  /** A run of `length` 1×1 cells starting at integer cell (x, y). */
  cellRun(color: string, x: number, y: number, length: number) {
    this.push(color, `M${x} ${y}h${length}.04v1.04h-${length}.04z`);
  }

  circle(color: string, cx: number, cy: number, r: number) {
    const d = round(r * 2);
    this.push(
      color,
      `M${round(cx - r)} ${round(cy)}a${round(r)} ${round(r)} 0 1 0 ${d} 0a${round(r)} ${round(r)} 0 1 0 ${-d} 0z`
    );
  }

  private push(color: string, segment: string) {
    const list = this.groups.get(color);
    if (list) {
      list.push(segment);
    } else {
      this.groups.set(color, [segment]);
    }
  }

  toElements(keyPrefix: string): JSX.Element[] {
    return [...this.groups].map(([color, segments], index) => (
      <path d={segments.join("")} fill={color} key={`${keyPrefix}-${index}`} />
    ));
  }
}

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
}

// Luminance limits at full intensity: dark modules never get lighter than
// DARK_CAP and light ones never darker than LIGHT_FLOOR, so a scanner's
// threshold still separates them.
const HALFTONE_DARK_CAP = 0.28;
const HALFTONE_LIGHT_FLOOR = 0.5;
const LOGO_DARK_CAP = 0.3;
const LOGO_TINT_FLOOR = 0.6;
const LOGO_FADE_CAP = 0.26;
/** Posterize photo cells so neighbours often share a color (smaller SVG). */
const HALFTONE_COLOR_STEP = 12;

/**
 * Draws every module that is not a finder eye in the art style. Returns null
 * when `art` is not usable, so callers fall back to the normal body pattern.
 */
export function renderQRArt(options: QRArtRenderOptions): JSX.Element | null {
  const { art, modules, version, margin, pixelSize } = options;
  const image = art.image && decodeArtImage(art.image);
  if (!(image && (QR_ART_MODES as readonly string[]).includes(art.mode))) {
    return null;
  }
  const size = modules.length;
  if (size !== version * 4 + 17) {
    return null;
  }
  const t = Math.min(Math.max(art.intensity ?? DEFAULT_ART_INTENSITY, 0), 1);
  const dark = linearFromHex(options.fgColor, [0, 0, 0]);
  const light = linearFromHex(options.bgColor, [1, 1, 1]);
  // Inverted or low-contrast colors: keep the plain look so nothing gets worse.
  const strength = luminance(dark) < luminance(light) ? t : 0;
  const functionModules = getQRFunctionModules(version);
  const darkHex = toHex(dark);
  const squares = new PathGroups();
  const marks = new PathGroups();

  const forEachModule = (
    draw: (x: number, y: number, isDark: boolean) => void
  ) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFinderModule(x, y, size)) {
          continue;
        }
        const isDark = Boolean(modules[y]?.[x]);
        if (functionModules[y]?.[x]) {
          // Timing, alignment, format and version modules stay solid.
          if (isDark) {
            squares.rect(
              darkHex,
              (x + margin) * pixelSize,
              (y + margin) * pixelSize,
              pixelSize,
              pixelSize
            );
          }
          continue;
        }
        draw(x, y, isDark);
      }
    }
  };

  let underlay: JSX.Element | null = null;
  if (art.mode === "halftone") {
    const place = placement(image, size, "cover");
    const darkCap =
      luminance(dark) +
      (Math.max(luminance(dark), HALFTONE_DARK_CAP) - luminance(dark)) *
        strength;
    const lightFloor =
      luminance(light) -
      (luminance(light) - Math.min(luminance(light), HALFTONE_LIGHT_FLOOR)) *
        strength;
    // The center keeps the true module value; it shrinks as intensity grows.
    const center = 1 - 0.6 * strength;
    const lightHex = toHex(light);
    // Photo cells: 3×3 per module, in cell units (null = not drawn)
    const cells = size * 3;
    const photo: (string | null)[][] = Array.from({ length: cells }, () =>
      new Array<string | null>(cells).fill(null)
    );

    forEachModule((x, y, isDark) => {
      if (strength > 0) {
        for (let sy = 0; sy < 3; sy++) {
          for (let sx = 0; sx < 3; sx++) {
            if (sx === 1 && sy === 1) {
              continue;
            }
            const sample = samplePixel(
              image,
              place,
              x + (sx + 0.5) / 3,
              y + (sy + 0.5) / 3,
              true
            );
            const color = mix(light, sample.color, sample.alpha);
            (photo[y * 3 + sy] as (string | null)[])[x * 3 + sx] = toHex(
              isDark
                ? capLuminance(color, darkCap)
                : floorLuminance(color, lightFloor),
              HALFTONE_COLOR_STEP
            );
          }
        }
      }
      const inset = (pixelSize * (1 - center)) / 2;
      if (isDark || strength > 0) {
        marks.rect(
          isDark ? darkHex : lightHex,
          (x + margin) * pixelSize + inset,
          (y + margin) * pixelSize + inset,
          pixelSize * center,
          pixelSize * center
        );
      }
    });

    if (strength > 0) {
      // Runs of equal cells share one rect; the slight overlap hides seams.
      const runs = new PathGroups();
      for (const [row, colors] of photo.entries()) {
        let start = 0;
        while (start < cells) {
          const color = colors[start];
          let end = start + 1;
          while (end < cells && colors[end] === color) {
            end++;
          }
          if (color) {
            runs.cellRun(color, start, row, end - start);
          }
          start = end;
        }
      }
      const cell = pixelSize / 3;
      underlay = (
        <g
          transform={`translate(${round(margin * pixelSize)} ${round(margin * pixelSize)}) scale(${round4(cell)})`}
        >
          {runs.toElements("art-photo")}
        </g>
      );
    }
  } else {
    const place = placement(image, size, "contain");
    const backdrop = backdropColor(image);
    const darkCap =
      luminance(dark) +
      (Math.max(luminance(dark), LOGO_DARK_CAP) - luminance(dark)) * strength;
    const tintFloor =
      luminance(light) -
      (luminance(light) - Math.min(luminance(light), LOGO_TINT_FLOOR)) *
        strength;
    const fadeCap =
      luminance(dark) +
      (Math.max(luminance(dark), LOGO_FADE_CAP) - luminance(dark)) * strength;
    const faded = toHex(
      capLuminance(mix(dark, light, 0.6 * strength), fadeCap)
    );
    const insideRadius = pixelSize * 0.46;
    const outsideRadius = pixelSize * (0.45 - 0.07 * strength);

    forEachModule((x, y, isDark) => {
      // Coverage and average color over a 3×3 grid inside the module
      let coverage = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const sample = samplePixel(
            image,
            place,
            x + (sx + 0.5) / 3,
            y + (sy + 0.5) / 3,
            false
          );
          const weight =
            backdrop && colorDistance(sample.color, backdrop) < 0.12
              ? 0
              : sample.alpha;
          coverage += weight;
          r += sample.color[0] * weight;
          g += sample.color[1] * weight;
          b += sample.color[2] * weight;
        }
      }
      const cx = (x + margin + 0.5) * pixelSize;
      const cy = (y + margin + 0.5) * pixelSize;
      const inside = coverage / 9 >= 0.5;
      if (!inside) {
        if (isDark) {
          marks.circle(faded, cx, cy, outsideRadius);
        }
        return;
      }
      const logo: Linear = [r / coverage, g / coverage, b / coverage];
      if (isDark) {
        marks.circle(toHex(capLuminance(logo, darkCap)), cx, cy, insideRadius);
      } else if (strength > 0) {
        squares.rect(
          toHex(floorLuminance(logo, tintFloor), 4),
          (x + margin) * pixelSize,
          (y + margin) * pixelSize,
          pixelSize,
          pixelSize
        );
      }
    });
  }

  return (
    <g data-qrdx-art={art.mode}>
      {underlay}
      {squares.toElements("art-square")}
      {marks.toElements("art-mark")}
    </g>
  );
}
