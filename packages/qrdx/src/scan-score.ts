/** biome-ignore-all lint/style/noMagicNumbers: scoring weights and thresholds */
import type { QRCode as JsQRResult } from "jsqr";
import type { ColorConfig, QRProps } from "../types";
import { normalizeColorConfig } from "../types/color-helpers";
import { EYE_POSITIONS } from "../types/constants";
import type { QRArtPixels } from "./art";
import qrcodegen from "./codegen";
import {
  DEFAULT_BGCOLOR,
  DEFAULT_FGCOLOR,
  DEFAULT_MARGIN,
  DEFAULT_SIZE,
  ERROR_LEVEL_MAP,
} from "./constants";
import { handleImageLoad } from "./detection";
import { withQRSize } from "./download";
import { getQRAsSVGDataUri } from "./export";
import { getFrameDimensions, getFrameGapRatio, isFrameActive } from "./frame";
import { getLogoBlockDamage } from "./logo-budget";
import { circleQuietZone, getLayoutMargin, isShapedCode } from "./qr-shape";
import { getStylePairRisk } from "./scan-risk";
import { getTemplateCodeShare } from "./template-placement";
import { getImageSettings, getLuminance, resolveErrorLevel } from "./utils";
import { parseColor, type RGBAColor } from "./utils/parse-color";

export type ScanGrade = "great" | "ok" | "risky" | "fails";

export interface ScanCheck {
  id: string;
  /** False only for a problem; a skipped check is `true` so it costs nothing. */
  passed: boolean;
  /**
   * The check couldn't run on this input (a photo cropped too tight to see
   * the quiet zone): neither passed nor failed. Show it as "not checked".
   */
  skipped?: boolean;
  message: string;
  /** How to fix a failed check */
  fix?: string;
}

export interface ScanScoreResult {
  /** 0–100 */
  score: number;
  grade: ScanGrade;
  checks: ScanCheck[];
}

export interface ImageScanScoreResult extends ScanScoreResult {
  /** Decoded content, or null when no QR code was found */
  data: string | null;
  /** QR version (1–40) when the code could be located */
  version: number | null;
}

export interface ScanScoreOptions {
  /** QR code widths in pixels to test (default 96, 160, 320) */
  sizes?: number[];
  signal?: AbortSignal;
}

/** Widths (px) of the QR code that `getScanScore` decodes by default. */
export const SCAN_TEST_SIZES = [96, 160, 320] as const;

// Code width (px) the artwork is rendered at before downscaling to test sizes.
const SOURCE_SIZE = 640;

type Decoder = typeof import("jsqr").default;
type DecodeState = "pass" | "fragile" | "fail";

function assertBrowser() {
  if (typeof document === "undefined") {
    throw new Error("Scan scoring needs a browser (canvas + image decoding)");
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Scan scoring was aborted", "AbortError");
  }
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function loadDecoder(): Promise<Decoder> {
  const { default: jsQR } = await import("jsqr");
  return jsQR;
}

function matches(result: JsQRResult | null, value: string): boolean {
  if (!result) {
    return false;
  }
  if (result.data === value) {
    return true;
  }
  try {
    return (
      new TextDecoder().decode(Uint8Array.from(result.binaryData)) === value
    );
  } catch {
    return false;
  }
}

/**
 * Camera-like degradation, in place: contrast loss plus a blur of about a
 * quarter module (two box-blur passes approximate a Gaussian).
 */
function simulateCamera(image: ImageData, modulePx: number, contrast = 0.7) {
  const { data, width, height } = image;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data[i + c] = 128 + ((data[i + c] as number) - 128) * contrast;
    }
  }
  const radius = Math.max(1, Math.round(modulePx * 0.25));
  const buffer = new Float32Array(width * height * 3);
  const blur = (horizontal: boolean) => {
    const lines = horizontal ? height : width;
    const length = horizontal ? width : height;
    const index = (line: number, position: number) =>
      horizontal ? line * width + position : position * width + line;
    const sums = [0, 0, 0];
    for (let line = 0; line < lines; line++) {
      sums.fill(0);
      // Sliding window with clamped edges
      for (let k = -radius; k <= radius; k++) {
        const p = index(line, Math.min(Math.max(k, 0), length - 1)) * 4;
        for (let c = 0; c < 3; c++) {
          sums[c] = (sums[c] as number) + (data[p + c] as number);
        }
      }
      for (let position = 0; position < length; position++) {
        const target = index(line, position) * 3;
        for (let c = 0; c < 3; c++) {
          buffer[target + c] = (sums[c] as number) / (2 * radius + 1);
        }
        const out = index(line, Math.max(position - radius, 0)) * 4;
        const into =
          index(line, Math.min(position + radius + 1, length - 1)) * 4;
        for (let c = 0; c < 3; c++) {
          sums[c] =
            (sums[c] as number) -
            (data[out + c] as number) +
            (data[into + c] as number);
        }
      }
    }
    for (let i = 0; i < width * height; i++) {
      for (let c = 0; c < 3; c++) {
        data[i * 4 + c] = buffer[i * 3 + c] as number;
      }
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    blur(true);
    blur(false);
  }
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Could not get canvas context");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

// A phone tries many frames at slightly different distances.
const ATTEMPT_SCALES = [0.9, 1, 1.1];

/**
 * Decodes the code at `size` px wide a few times at slightly different
 * scales through the camera simulation. `draw` returns the pixels with the
 * code `codeWidth` px wide.
 */
function decodeAtSize(
  jsQR: Decoder,
  draw: (codeWidth: number) => ImageData,
  size: number,
  moduleCount: number,
  expected: (result: JsQRResult | null) => boolean
): DecodeState {
  let hits = 0;
  for (const scale of ATTEMPT_SCALES) {
    const codeWidth = size * scale;
    const image = draw(codeWidth);
    simulateCamera(image, codeWidth / moduleCount);
    if (expected(jsQR(image.data, image.width, image.height))) {
      hits++;
    }
  }
  if (hits >= 2) {
    return "pass";
  }
  return hits === 1 ? "fragile" : "fail";
}

const SIZE_LABELS: Record<string, string> = {
  small: "small print or far away",
  medium: "typical phone distance",
  large: "close up",
};

function sizeLabel(size: number, sizes: number[]): string {
  if (size === sizes[0] && sizes.length > 1) {
    return SIZE_LABELS.small as string;
  }
  if (size === sizes.at(-1)) {
    return SIZE_LABELS.large as string;
  }
  return SIZE_LABELS.medium as string;
}

/** Penalty for a failed decode at a size: big codes matter most. */
function decodePenalty(index: number, count: number, state: DecodeState) {
  if (state === "pass") {
    return 0;
  }
  const weights = count === 1 ? [45] : count === 2 ? [20, 45] : [15, 20, 45];
  const weight =
    weights[
      Math.round((index * (weights.length - 1)) / Math.max(count - 1, 1))
    ] ?? 20;
  return state === "fragile" ? Math.round(weight / 2) : weight;
}

function decodeCheck(
  size: number,
  sizes: number[],
  state: DecodeState
): ScanCheck {
  const label = `${size} px (${sizeLabel(size, sizes)})`;
  if (state === "pass") {
    return {
      id: `decode-${size}`,
      passed: true,
      message: `Reads at ${label}, with camera blur`,
    };
  }
  return {
    id: `decode-${size}`,
    passed: false,
    message:
      state === "fragile"
        ? `Reads at ${label} only some of the time`
        : `Doesn't read at ${label}`,
    fix:
      size === sizes[0]
        ? "Print it bigger, shorten the content (fewer modules) or use solid square dots"
        : "Raise the contrast, use bigger dots or a simpler eye shape",
  };
}

function gradeFor(score: number, fails: boolean): ScanGrade {
  if (fails) {
    return "fails";
  }
  if (score >= 85) {
    return "great";
  }
  if (score >= 65) {
    return "ok";
  }
  return "risky";
}

/**
 * The lightest and darkest a picture gets, as "#rrggbb": the colors at its
 * 90th and 10th percentile luminance. The contrast check judges an image
 * fill by these (see getImageTones).
 */
export interface ImageTones {
  light: string;
  dark: string;
}

/** Image tones by image `src`. */
export type ImageToneMap = Record<string, ImageTones>;

/**
 * The colors a paint shows: the color, every gradient stop, or an image
 * fill's tones at its opacity over its underlay. An image whose tones aren't
 * known counts as its underlay (or not at all, without one).
 */
function colorStops(
  color: ColorConfig | undefined,
  fallback: string,
  tones?: ImageToneMap
): string[] {
  const normalized = normalizeColorConfig(color, fallback);
  if (normalized.type === "solid") {
    return [normalized.color];
  }
  if (normalized.type !== "image") {
    return normalized.stops.map((stop) => stop.color);
  }
  const underlay = normalized.underlay ? toRGBA(normalized.underlay) : null;
  const known = tones?.[normalized.src];
  if (!known) {
    return normalized.underlay ? [normalized.underlay] : [];
  }
  const opacity = normalized.opacity ?? 1;
  return [known.light, known.dark].flatMap((tone) => {
    const parsed = toRGBA(tone);
    if (!parsed) {
      return [];
    }
    const picture = { ...parsed, a: parsed.a * opacity };
    if (!underlay) {
      return [rgbaString(picture)];
    }
    // Picture over the underlay: alpha adds up as source-over does
    const a = picture.a + underlay.a * (1 - picture.a);
    const mix = (p: number, u: number) =>
      a > 0 ? (p * picture.a + u * underlay.a * (1 - picture.a)) / a : 0;
    return [
      rgbaString({
        r: mix(picture.r, underlay.r),
        g: mix(picture.g, underlay.g),
        b: mix(picture.b, underlay.b),
        a,
      }),
    ];
  });
}

const rgbaString = ({ r, g, b, a }: RGBAColor) =>
  `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 1000) / 1000})`;

/**
 * Image tones from RGBA pixels (alpha below half skipped): the average color
 * of the darkest and the lightest tenth of the pixels.
 */
export function getImageTonesFromPixels(pixels: {
  data: ArrayLike<number>;
  width: number;
  height: number;
}): ImageTones | null {
  const samples: { lum: number; r: number; g: number; b: number }[] = [];
  const count = pixels.width * pixels.height;
  for (let i = 0; i < count; i++) {
    const r = pixels.data[i * 4] as number;
    const g = pixels.data[i * 4 + 1] as number;
    const b = pixels.data[i * 4 + 2] as number;
    const a = pixels.data[i * 4 + 3] as number;
    if (a < 128) {
      continue;
    }
    samples.push({ lum: getLuminance(r, g, b), r, g, b });
  }
  if (samples.length === 0) {
    return null;
  }
  samples.sort((x, y) => x.lum - y.lum);
  const tenth = Math.max(1, Math.round(samples.length / 10));
  const average = (list: typeof samples) => {
    const sum = list.reduce(
      (total, item) => ({
        r: total.r + item.r,
        g: total.g + item.g,
        b: total.b + item.b,
      }),
      { r: 0, g: 0, b: 0 }
    );
    const hex = (value: number) =>
      Math.round(value / list.length)
        .toString(16)
        .padStart(2, "0");
    return `#${hex(sum.r)}${hex(sum.g)}${hex(sum.b)}`;
  };
  return {
    dark: average(samples.slice(0, tenth)),
    light: average(samples.slice(-tenth)),
  };
}

/** Image tones of a picture (browser only): drawn at 64 px and sampled. */
export async function getImageTones(src: string): Promise<ImageTones | null> {
  assertBrowser();
  const img = await loadImage(src);
  const { canvas, ctx } = createCanvas(64, 64);
  ctx.drawImage(img, 0, 0, 64, 64);
  const tones = getImageTonesFromPixels(ctx.getImageData(0, 0, 64, 64));
  canvas.remove();
  return tones;
}

/** Every image fill's `src` in the props. */
function imageSources(props: QRProps): string[] {
  const paints = [
    props.bgColor,
    props.fgColor,
    props.eyeColor,
    props.dotColor,
    ...EYE_POSITIONS.flatMap((position) => [
      props.eyeColors?.[position]?.outer,
      props.eyeColors?.[position]?.inner,
    ]),
  ];
  const sources = new Set<string>();
  for (const paint of paints) {
    if (typeof paint === "object" && paint?.type === "image") {
      sources.add(paint.src);
    }
  }
  return [...sources];
}

let normalizeCtx: CanvasRenderingContext2D | null = null;

/** parseColor, falling back to the browser's own color parser. */
function toRGBA(color: string): RGBAColor | null {
  const parsed = parseColor(color);
  if (parsed || typeof document === "undefined") {
    return parsed;
  }
  normalizeCtx ??= document.createElement("canvas").getContext("2d");
  if (!normalizeCtx) {
    return null;
  }
  normalizeCtx.fillStyle = "#010203";
  normalizeCtx.fillStyle = color;
  const normalized = String(normalizeCtx.fillStyle);
  return normalized === "#010203" ? null : parseColor(normalized);
}

const luminanceOf = (color: RGBAColor) =>
  getLuminance(color.r, color.g, color.b);

const ratioOf = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Contrast at or above this scans reliably (the scan score's pass line). */
export const SCAN_CONTRAST_MIN = 4.5;
/** Below this the score costs 30 points instead of 10. */
export const SCAN_CONTRAST_LOW = 3;
/** Below this the code fails the scan score outright. */
export const SCAN_CONTRAST_FAIL = 1.5;

/**
 * Contrast a picture needs to scan reliably, in the code or behind it: its
 * detail reads as noise at phone distances. Measured with the sample photos
 * through the camera model (tests/export-image.test.ts): every picture in
 * the dots decoded from 6.5:1, and busy photos behind the dots from 12:1.
 */
export const SCAN_IMAGE_CONTRAST_MIN = { code: 7, background: 12 } as const;

export interface ScanContrast {
  /**
   * Worst contrast between any code color and any background color (≥ 1);
   * Infinity when no code color parses
   */
  ratio: number;
  /**
   * What `ratio`'s pair needs: SCAN_CONTRAST_MIN for colors, more when a
   * picture is involved (SCAN_IMAGE_CONTRAST_MIN). The low and fail lines
   * scale with it.
   */
  required: number;
  /** Some code color is lighter than the background */
  inverted: boolean;
}

const WHITE: RGBAColor = { r: 255, g: 255, b: 255, a: 1 };

/** `color` composited over an opaque `backdrop`. */
const over = (color: RGBAColor, backdrop: RGBAColor): RGBAColor => ({
  r: color.r * color.a + backdrop.r * (1 - color.a),
  g: color.g * color.a + backdrop.g * (1 - color.a),
  b: color.b * color.a + backdrop.b * (1 - color.a),
  a: 1,
});

/**
 * The contrast check behind the scan score: the worst WCAG contrast ratio
 * between every code color (foreground, eyes, eye centres and per-eye
 * colors, every gradient stop) and every background color. See-through
 * colors count as they look: the background over white paper, the code
 * over the background.
 */
export function getScanContrast(
  props: QRProps,
  options: { imageTones?: ImageToneMap } = {}
): ScanContrast {
  const tones = options.imageTones;
  // Each color a part shows, and whether it comes from a picture
  const samples = (
    color: ColorConfig | undefined,
    fallback: string
  ): { color: string; picture: boolean }[] => {
    const picture = typeof color === "object" && color?.type === "image";
    return colorStops(color, fallback, tones).map((item) => ({
      color: item,
      picture,
    }));
  };
  const fg = props.fgColor ?? DEFAULT_FGCOLOR;
  // Per-eye colors replace eyeColor / dotColor on that eye only
  const perEye = EYE_POSITIONS.flatMap((position) => {
    const eye = props.eyeColors?.[position];
    return [
      ...(eye?.outer ? samples(eye.outer, DEFAULT_FGCOLOR) : []),
      ...(eye?.inner ? samples(eye.inner, DEFAULT_FGCOLOR) : []),
    ];
  });
  const darkColors = [
    ...samples(fg, DEFAULT_FGCOLOR),
    ...samples(props.eyeColor ?? fg, DEFAULT_FGCOLOR),
    ...samples(props.dotColor ?? fg, DEFAULT_FGCOLOR),
    ...perEye,
  ];
  const lightColors = samples(props.bgColor, DEFAULT_BGCOLOR);
  // A transparent background prints on whatever is behind it; assume paper.
  const background = (
    lightColors.length > 0
      ? lightColors
      : [{ color: "#ffffff", picture: false }]
  ).map((item) => {
    const parsed = toRGBA(item.color);
    return {
      color: parsed ? over(parsed, WHITE) : WHITE,
      picture: item.picture,
    };
  });
  const foreground = darkColors.flatMap((item) => {
    const parsed = toRGBA(item.color);
    return parsed ? [{ color: parsed, picture: item.picture }] : [];
  });

  // The worst pair relative to what it needs: a picture's detail reads as
  // noise, so pictures need more contrast than flat colors.
  let worst = Number.POSITIVE_INFINITY;
  let required = SCAN_CONTRAST_MIN;
  let inverted = false;
  for (const dark of foreground) {
    for (const light of background) {
      const darkLum = luminanceOf(over(dark.color, light.color));
      const lightLum = luminanceOf(light.color);
      const ratio = ratioOf(darkLum, lightLum);
      const needs = light.picture
        ? SCAN_IMAGE_CONTRAST_MIN.background
        : dark.picture
          ? SCAN_IMAGE_CONTRAST_MIN.code
          : SCAN_CONTRAST_MIN;
      if (ratio / needs < worst / required) {
        worst = ratio;
        required = needs;
      }
      if (darkLum > lightLum) {
        inverted = true;
      }
    }
  }
  return {
    ratio: Number.isFinite(worst) ? worst : Number.POSITIVE_INFINITY,
    required,
    inverted,
  };
}

function contrastChecks(
  props: QRProps,
  imageTones?: ImageToneMap
): {
  checks: ScanCheck[];
  penalty: number;
  fails: boolean;
} {
  const {
    ratio: worst,
    inverted,
    required,
  } = getScanContrast(props, { imageTones });
  // No code color parses: nothing to compare
  if (!Number.isFinite(worst)) {
    return { checks: [], penalty: 0, fails: false };
  }
  // The low and fail lines scale with what the pair needs
  const scale = required / SCAN_CONTRAST_MIN;
  const picture = required !== SCAN_CONTRAST_MIN;

  const ratio = Math.round(worst * 10) / 10;
  const checks: ScanCheck[] = [];
  let penalty = 0;
  if (worst >= required) {
    checks.push({
      id: "contrast",
      passed: true,
      message: `Contrast ${ratio}:1 between code and background`,
    });
  } else {
    penalty =
      worst < SCAN_CONTRAST_FAIL * scale
        ? 60
        : worst < SCAN_CONTRAST_LOW * scale
          ? 30
          : 10;
    checks.push({
      id: "contrast",
      passed: false,
      message: picture
        ? `Low contrast for a picture (${ratio}:1); ${required}:1 or more scans reliably`
        : `Low contrast (${ratio}:1); 4.5:1 or more scans reliably`,
      fix: picture
        ? "Lower the picture's opacity over a darker underlay (dots) or a lighter one (background)"
        : "Use a darker code color or a lighter background",
    });
  }
  if (inverted) {
    penalty += 10;
    checks.push({
      id: "polarity",
      passed: false,
      message:
        "Light code on a dark background; some scanner apps can't read it",
      fix: "Use dark modules on a light background",
    });
  } else {
    checks.push({
      id: "polarity",
      passed: true,
      message: "Dark code on a light background",
    });
  }
  return {
    checks,
    penalty,
    fails: worst < SCAN_CONTRAST_FAIL * (required / SCAN_CONTRAST_MIN),
  };
}

function moduleCount(props: QRProps) {
  return qrcodegen.QrCode.encodeText(
    props.value,
    ERROR_LEVEL_MAP[resolveErrorLevel(props)]
  ).getModules();
}

function logoCheck(props: QRProps): {
  check: ScanCheck | null;
  penalty: number;
} {
  const { imageSettings } = props;
  if (!imageSettings) {
    return { check: null, penalty: 0 };
  }
  const cells = moduleCount(props);
  const settings = getImageSettings(
    cells,
    props.size ?? DEFAULT_SIZE,
    getLayoutMargin(cells.length, props.margin ?? DEFAULT_MARGIN, props.shape),
    imageSettings
  );
  if (!settings) {
    return { check: null, penalty: 0 };
  }
  // A moved logo must leave each corner eye and the format information
  // beside it (the 9×9 corner zones) alone: no error correction covers them.
  const box = settings.excavation ?? settings;
  const n = cells.length;
  const zones = [
    [0, 0],
    [n - 8, 0],
    [0, n - 8],
  ] as const;
  const coversEye = zones.some(
    ([zx, zy]) =>
      box.x < zx + 9 &&
      box.x + box.w > zx &&
      box.y < zy + 9 &&
      box.y + box.h > zy
  );
  // Decoders correct perspective with the alignment pattern nearest the
  // bottom-right corner (version 2 and up, 5×5 around n − 7); others, like
  // the central one in bigger codes, can sit under a centered logo.
  const alignment = n > 21 ? n - 9 : null;
  const coversAlignment =
    alignment !== null &&
    box.x < alignment + 5 &&
    box.x + box.w > alignment &&
    box.y < alignment + 5 &&
    box.y + box.h > alignment;
  if (coversEye || coversAlignment) {
    return {
      check: {
        id: "logo",
        passed: false,
        message: coversEye
          ? "The logo covers a corner eye"
          : "The logo covers the small square near the bottom-right corner",
        fix: "Move the logo toward the center or make it smaller",
      },
      penalty: 40,
    };
  }
  const coverage = (box.w * box.h) / (n * n);
  const level = resolveErrorLevel(props);
  const percent = Math.round(coverage * 100);
  // Count spoiled codewords per Reed–Solomon block, as getQRData caps logos
  // (logo-budget.ts): area alone passes logos small codes can't repair.
  const damage = getLogoBlockDamage(
    {
      value: props.value,
      size: props.size ?? DEFAULT_SIZE,
      margin: props.margin ?? DEFAULT_MARGIN,
      level,
      shape: props.shape,
    },
    imageSettings
  );
  if (!damage || damage.worst <= damage.budget) {
    return {
      check: {
        id: "logo",
        passed: true,
        message: `Logo covers ${percent}% of the code; error correction repairs it with room to spare`,
      },
      penalty: 0,
    };
  }
  return {
    check: {
      id: "logo",
      passed: false,
      message: `Logo covers ${percent}% of the code and spoils ${damage.worst} codewords in one block, which repairs ${damage.correctable}`,
      fix:
        damage.level === "H"
          ? "Use a smaller logo"
          : "Switch error correction to H or use a smaller logo",
    },
    penalty: damage.worst > damage.correctable ? 25 : 10,
  };
}

function quietZoneCheck(props: QRProps): { check: ScanCheck; penalty: number } {
  // A shaped code keeps at least QR_CIRCLE_QUIET_MIN before its decoration
  const margin = isShapedCode(props.shape)
    ? circleQuietZone(props.margin ?? DEFAULT_MARGIN)
    : (props.margin ?? DEFAULT_MARGIN);
  const count = moduleCount(props).length + 2 * margin;
  // A frame keeps a light gap around the code.
  const modules =
    margin +
    (isFrameActive(props.frame) ? getFrameGapRatio(props.frame) * count : 0);
  const rounded = Math.round(modules * 10) / 10;
  if (modules >= 4) {
    return {
      check: {
        id: "quiet-zone",
        passed: true,
        message: `Quiet zone of ${rounded} modules`,
      },
      penalty: 0,
    };
  }
  if (modules >= 1.5) {
    return {
      check: {
        id: "quiet-zone",
        passed: true,
        message: `Quiet zone of ${rounded} modules (4 is ideal)`,
      },
      penalty: 0,
    };
  }
  return {
    check: {
      id: "quiet-zone",
      passed: false,
      message: "No quiet zone around the code",
      fix: "Leave clear space (about 10% of the code width) around it wherever you place it, or add a frame",
    },
    penalty: 5,
  };
}

function eyeCheck(props: QRProps): { check: ScanCheck; penalty: number } {
  // QRCodeSVG draws "gear" eyes when no pattern is given.
  const pattern = props.cornerEyePattern ?? "gear";
  if (pattern === "curly") {
    return {
      check: {
        id: "eye-shape",
        passed: false,
        message: "Curly eyes fail strict decoders such as ZXing-based apps",
        fix: "Pick square, rounded or gear eyes",
      },
      penalty: 40,
    };
  }
  if (pattern === "circle") {
    return {
      check: {
        id: "eye-shape",
        passed: false,
        message:
          "Circle eyes only read in lenient decoders; many apps miss them",
        fix: "Pick square, rounded or gear eyes",
      },
      penalty: 20,
    };
  }
  return {
    check: {
      id: "eye-shape",
      passed: true,
      message: `No known decoder issues with ${pattern} eyes`,
    },
    penalty: 0,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

// Stand-in for a logo that can't be loaded (e.g. CORS): an opaque block
// covers the same modules a real logo would.
const LOGO_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" rx="2" fill="#808080"/></svg>'
)}`;

async function inlineLogo(props: QRProps): Promise<QRProps> {
  const { imageSettings } = props;
  if (!imageSettings || imageSettings.src.startsWith("data:")) {
    return props;
  }
  let inlined = LOGO_PLACEHOLDER;
  try {
    const img = await loadImage(imageSettings.src);
    const { canvas, ctx } = createCanvas(
      img.naturalWidth || 256,
      img.naturalHeight || 256
    );
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    inlined = canvas.toDataURL("image/png");
  } catch {
    // Keep the placeholder
  }
  return { ...props, imageSettings: { ...imageSettings, src: inlined } };
}

/**
 * Image fills drawn from a data URL: an SVG drawn as an image can't load
 * anything else, so other sources are redrawn on a canvas (or left out).
 */
async function inlineImagePaints(props: QRProps): Promise<QRProps> {
  const inlined = new Map<string, string | null>();
  for (const src of imageSources(props)) {
    if (src.startsWith("data:")) {
      continue;
    }
    try {
      const img = await loadImage(src);
      const { canvas, ctx } = createCanvas(
        img.naturalWidth || 256,
        img.naturalHeight || 256
      );
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      inlined.set(src, canvas.toDataURL("image/png"));
      canvas.remove();
    } catch {
      inlined.set(src, null);
    }
  }
  if (inlined.size === 0) {
    return props;
  }
  const swap = (paint: ColorConfig | undefined): ColorConfig | undefined => {
    if (typeof paint !== "object" || paint?.type !== "image") {
      return paint;
    }
    const src = inlined.get(paint.src);
    if (src === undefined) {
      return paint;
    }
    return src ? { ...paint, src } : (paint.underlay ?? DEFAULT_FGCOLOR);
  };
  const eyeColors = props.eyeColors
    ? Object.fromEntries(
        Object.entries(props.eyeColors).map(([position, eye]) => [
          position,
          eye && { outer: swap(eye.outer), inner: swap(eye.inner) },
        ])
      )
    : undefined;
  return {
    ...props,
    bgColor: swap(props.bgColor),
    fgColor: swap(props.fgColor),
    eyeColor: swap(props.eyeColor),
    dotColor: swap(props.dotColor),
    ...(eyeColors && { eyeColors }),
  };
}

type DrawArtwork = (codeWidth: number) => ImageData;

/**
 * The score itself, shared by the browser and the pixel entry points:
 * contrast, logo coverage vs error correction, quiet zone, eye shape and
 * style-pair risk, plus decoding through the camera model at each size.
 * `draw` returns the whole artwork (code and frame) with the code
 * `codeWidth` px wide, on white.
 */
async function scoreArtwork(
  props: QRProps,
  draw: DrawArtwork,
  sizes: number[],
  signal?: AbortSignal,
  imageTones?: ImageToneMap
): Promise<ScanScoreResult> {
  const checks: ScanCheck[] = [];
  let penalty = 0;

  const contrast = contrastChecks(props, imageTones);
  penalty += contrast.penalty;
  const logo = logoCheck(props);
  penalty += logo.penalty;
  const quietZone = quietZoneCheck(props);
  penalty += quietZone.penalty;
  const eye = eyeCheck(props);
  penalty += eye.penalty;
  // Known-weak style pairs and centres (see scan-risk.ts); weak eyes on
  // their own are already covered by the eye-shape check above.
  const styleRisk = getStylePairRisk(props);
  const pairRisk = styleRisk?.kind === "eye" ? null : styleRisk;
  // Sharp-render pairs fail one strict decoder only (see scan-risk.ts): they
  // show as a check with its fix but cost nothing until a phone test
  // confirms them, so grades and the AI design loop don't change.
  if (pairRisk && pairRisk.kind !== "sharp-dot-eye") {
    penalty += 10;
  }

  const jsQR = await loadDecoder();
  throwIfAborted(signal);

  const symbol = moduleCount(props).length;
  const modules =
    symbol +
    2 * getLayoutMargin(symbol, props.margin ?? DEFAULT_MARGIN, props.shape);
  const decodeChecks: ScanCheck[] = [];
  let largestFails = false;

  for (const [index, size] of sizes.entries()) {
    await nextTick();
    throwIfAborted(signal);
    const state = decodeAtSize(jsQR, draw, size, modules, (result) =>
      matches(result, props.value)
    );
    penalty += decodePenalty(index, sizes.length, state);
    decodeChecks.push(decodeCheck(size, sizes, state));
    if (index === sizes.length - 1 && state === "fail") {
      largestFails = true;
    }
  }

  checks.push(...decodeChecks, ...contrast.checks);
  if (logo.check) {
    checks.push(logo.check);
  }
  checks.push(eye.check, quietZone.check);
  if (pairRisk) {
    checks.push({
      id: "style-pair",
      passed: false,
      message: pairRisk.message,
      fix: pairRisk.fix,
    });
  }

  const fails = largestFails || contrast.fails;
  let score = Math.max(0, Math.min(100, 100 - penalty));
  if (fails) {
    score = Math.min(score, 30);
  }
  return { score, grade: gradeFor(score, fails), checks };
}

function testSizes(options: ScanScoreOptions): number[] {
  return [...(options.sizes ?? SCAN_TEST_SIZES)]
    .filter((size) => size > 0)
    .sort((a, b) => a - b);
}

/**
 * Estimates how reliably a QR design scans (browser only). Renders the code
 * at several sizes with mild blur and contrast loss, decodes each with jsQR,
 * and combines that with contrast, logo coverage vs error correction, quiet
 * zone and eye-shape risk. jsQR is loaded on demand.
 *
 * This is a heuristic: real cameras, lighting and scanner apps vary.
 */
export async function getScanScore(
  props: QRProps,
  options: ScanScoreOptions = {}
): Promise<ScanScoreResult> {
  assertBrowser();
  const { signal } = options;
  const sizes = testSizes(options);

  // A template draws the code smaller than its artwork: render the artwork
  // large enough for the code itself to be SOURCE_SIZE wide
  const artworkSize = SOURCE_SIZE / getTemplateCodeShare(props);
  const sourceProps = await inlineImagePaints(
    await inlineLogo(
      withQRSize({ ...props, size: props.size ?? DEFAULT_SIZE }, artworkSize)
    )
  );
  throwIfAborted(signal);
  const imageTones: ImageToneMap = {};
  for (const src of imageSources(props)) {
    try {
      const tones = await getImageTones(src);
      if (tones) {
        imageTones[src] = tones;
      }
    } catch {
      // An image that won't load is judged by its underlay
    }
  }
  throwIfAborted(signal);
  const svgUri = await getQRAsSVGDataUri(sourceProps);
  const img = await loadImage(svgUri);
  throwIfAborted(signal);

  const artwork = getFrameDimensions(artworkSize, props.frame);
  const drawArtwork = (codeWidth: number) => {
    const scale = codeWidth / SOURCE_SIZE;
    const width = artwork.width * scale;
    const height = artwork.height * scale;
    const pad = Math.max(8, Math.round(codeWidth * 0.12));
    const { canvas, ctx } = createCanvas(width + 2 * pad, height + 2 * pad);
    // Codes are scanned off paper or screens; test on white.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, pad, pad, width, height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.remove();
    return image;
  };
  return await scoreArtwork(props, drawArtwork, sizes, signal, imageTones);
}

/**
 * Smallest code width (px) the artwork passed to `getScanScoreFromPixels`
 * should have: twice the largest default test size, so every test size is a
 * downscale, as it is in the browser.
 */
export const PIXEL_SCORE_MIN_CODE_WIDTH = SOURCE_SIZE;

/**
 * `getScanScore` for servers and other places without a DOM: the same
 * checks, weights and camera model, decoding `pixels` instead of drawing the
 * SVG on a canvas. `pixels` is the whole artwork as `props` renders it (the
 * code plus its frame or template, if any), at any size with the code itself
 * at least `PIXEL_SCORE_MIN_CODE_WIDTH` px wide (rasterized with resvg, sharp
 * or a canvas; a template draws the code smaller than its artwork).
 * Transparent pixels count as white, like paper. Logos must already
 * be painted into the pixels; an opaque placeholder of the same size scores
 * the same.
 */
export async function getScanScoreFromPixels(
  props: QRProps,
  pixels: QRArtPixels,
  options: ScanScoreOptions = {}
): Promise<ScanScoreResult> {
  const { width, height } = pixels;
  if (!(width > 0 && height > 0) || pixels.data.length < width * height * 4) {
    throw new Error("Pixels must be width × height × 4 RGBA bytes");
  }
  const sizes = testSizes(options);
  const size = props.size ?? DEFAULT_SIZE;
  const artwork = getFrameDimensions(size, props.frame);
  // Code width in the source pixels (a template draws it smaller than its
  // artwork)
  const sourceCodeWidth =
    (width * size * getTemplateCodeShare(props)) / artwork.width;
  const source = { data: onWhite(pixels), width, height };

  const drawArtwork = (codeWidth: number) => {
    const art = resizePixels(source, codeWidth / sourceCodeWidth);
    const pad = Math.max(8, Math.round(codeWidth * 0.12));
    return padWhite(art, pad);
  };
  return await scoreArtwork(props, drawArtwork, sizes, options.signal);
}

/** RGBA flattened onto white (opaque), as the browser draws on a white canvas. */
function onWhite(pixels: QRArtPixels): Uint8ClampedArray {
  const { data, width, height } = pixels;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height * 4; i += 4) {
    const alpha = (data[i + 3] as number) / 255;
    for (let c = 0; c < 3; c++) {
      out[i + c] = (data[i + c] as number) * alpha + 255 * (1 - alpha);
    }
    out[i + 3] = 255;
  }
  return out;
}

/** `image` centred on a white border `pad` px wide. */
function padWhite(image: ImageData, pad: number): ImageData {
  const width = image.width + 2 * pad;
  const height = image.height + 2 * pad;
  const out = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < image.height; y++) {
    out.set(
      image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4),
      ((y + pad) * width + pad) * 4
    );
  }
  return { data: out, width, height, colorSpace: "srgb" } as ImageData;
}

// ── Images ─────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function lumaAt(data: Uint8ClampedArray, index: number) {
  return (
    0.299 * (data[index] as number) +
    0.587 * (data[index + 1] as number) +
    0.114 * (data[index + 2] as number)
  );
}

/** Otsu threshold over the luma histogram of a region. */
function otsu(histogram: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * (histogram[i] as number);
  }
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let threshold = 128;
  for (let i = 0; i < 256; i++) {
    weightBackground += histogram[i] as number;
    if (weightBackground === 0) {
      continue;
    }
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) {
      break;
    }
    sumBackground += i * (histogram[i] as number);
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between =
      weightBackground *
      weightForeground *
      (meanBackground - meanForeground) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

async function imageFromSource(
  source: HTMLImageElement | Blob
): Promise<HTMLImageElement> {
  if (!(source instanceof Blob)) {
    if (!source.complete) {
      await new Promise((resolve) => {
        source.addEventListener("load", resolve, { once: true });
        source.addEventListener("error", resolve, { once: true });
      });
    }
    return source;
  }
  const url = URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    await img.decode?.().catch(() => undefined);
    return img;
  } finally {
    // The decoded image stays usable after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Scores an existing QR code image (browser only, nothing is uploaded):
 * finds and decodes the code, then checks it still decodes when shrunk and
 * blurred, its contrast, polarity, quiet zone and the image resolution.
 */
export async function getImageScanScore(
  source: HTMLImageElement | Blob,
  options: ScanScoreOptions = {}
): Promise<ImageScanScoreResult> {
  assertBrowser();
  const { signal } = options;
  const sizes = [...(options.sizes ?? SCAN_TEST_SIZES)]
    .filter((size) => size > 0)
    .sort((a, b) => a - b);
  const jsQR = await loadDecoder();
  const img = await imageFromSource(source);
  throwIfAborted(signal);

  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;
  if (!(naturalWidth && naturalHeight)) {
    throw new Error("Could not read this image");
  }

  const fit = Math.min(1, 1600 / Math.max(naturalWidth, naturalHeight));
  const { canvas, ctx } = createCanvas(naturalWidth * fit, naturalHeight * fit);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const full = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const located = jsQR(full.data, full.width, full.height);
  throwIfAborted(signal);

  if (!located) {
    // Fall back to the library's crop-and-retry detection for the content.
    const detected = await handleImageLoad(img, 0, false);
    canvas.remove();
    if (typeof detected !== "string" || detected === "NO_QR") {
      return {
        data: null,
        version: null,
        score: 0,
        grade: "fails",
        checks: [
          {
            id: "decode",
            passed: false,
            message: "No QR code found in this image",
            fix: "Try a sharper, well-lit, straight-on photo or a screenshot",
          },
        ],
      };
    }
    return {
      data: detected,
      version: null,
      score: 55,
      grade: "risky",
      checks: [
        {
          id: "decode",
          passed: false,
          message:
            "Decoded only after cropping; the code is small or hard to find in this image",
          fix: "Make the code bigger relative to its surroundings",
        },
      ],
    };
  }

  const { location, version } = located;
  const dimension = 17 + 4 * version;
  const codeWidth =
    (distance(location.topLeftCorner, location.topRightCorner) +
      distance(location.bottomLeftCorner, location.bottomRightCorner) +
      distance(location.topLeftCorner, location.bottomLeftCorner) +
      distance(location.topRightCorner, location.bottomRightCorner)) /
    4;
  const modulePx = codeWidth / dimension;
  const corners = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner,
  ];
  const minX = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))));
  const maxX = Math.min(
    full.width,
    Math.ceil(Math.max(...corners.map((p) => p.x)))
  );
  const minY = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))));
  const maxY = Math.min(
    full.height,
    Math.ceil(Math.max(...corners.map((p) => p.y)))
  );

  const checks: ScanCheck[] = [];
  let penalty = 0;

  // Contrast: split the code's pixels into dark and light with Otsu.
  const histogram = new Array<number>(256).fill(0);
  let total = 0;
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const luma = Math.round(lumaAt(full.data, (y * full.width + x) * 4));
      histogram[luma] = (histogram[luma] as number) + 1;
      total++;
    }
  }
  const threshold = otsu(histogram, total);
  const sums = { dark: [0, 0, 0, 0], light: [0, 0, 0, 0] };
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const i = (y * full.width + x) * 4;
      const bucket = lumaAt(full.data, i) <= threshold ? sums.dark : sums.light;
      bucket[0] = (bucket[0] as number) + (full.data[i] as number);
      bucket[1] = (bucket[1] as number) + (full.data[i + 1] as number);
      bucket[2] = (bucket[2] as number) + (full.data[i + 2] as number);
      bucket[3] = (bucket[3] as number) + 1;
    }
  }
  const mean = (bucket: number[]) => {
    const count = Math.max(bucket[3] as number, 1);
    return getLuminance(
      (bucket[0] as number) / count,
      (bucket[1] as number) / count,
      (bucket[2] as number) / count
    );
  };
  const darkLum = mean(sums.dark);
  const lightLum = mean(sums.light);
  const contrast = ratioOf(darkLum, lightLum);
  const contrastRounded = Math.round(contrast * 10) / 10;
  if (contrast >= 4.5) {
    checks.push({
      id: "contrast",
      passed: true,
      message: `Contrast ${contrastRounded}:1 in the image`,
    });
  } else {
    penalty += contrast < 2 ? 30 : 10;
    checks.push({
      id: "contrast",
      passed: false,
      message: `Low contrast in the image (${contrastRounded}:1)`,
      fix: "Use a darker code on a lighter background, or better lighting for photos",
    });
  }

  // Polarity: finder pattern centers are dark in a normal code.
  const finderLuma = [
    location.topLeftFinderPattern,
    location.topRightFinderPattern,
    location.bottomLeftFinderPattern,
  ].map((point) => {
    const x = Math.min(full.width - 1, Math.max(0, Math.round(point.x)));
    const y = Math.min(full.height - 1, Math.max(0, Math.round(point.y)));
    return lumaAt(full.data, (y * full.width + x) * 4);
  });
  const inverted = finderLuma.filter((luma) => luma > threshold).length >= 2;
  if (inverted) {
    penalty += 10;
    checks.push({
      id: "polarity",
      passed: false,
      message:
        "Light code on a dark background; some scanner apps can't read it",
      fix: "Use dark modules on a light background",
    });
  } else {
    checks.push({
      id: "polarity",
      passed: true,
      message: "Dark code on a light background",
    });
  }

  // Quiet zone: a 2-module ring around the code should be clear.
  const ring = Math.max(2, Math.round(modulePx * 2));
  const ringBox = {
    minX: minX - ring,
    maxX: maxX + ring,
    minY: minY - ring,
    maxY: maxY + ring,
  };
  const clipped =
    ringBox.minX < 0 ||
    ringBox.minY < 0 ||
    ringBox.maxX > full.width ||
    ringBox.maxY > full.height;
  if (clipped) {
    checks.push({
      id: "quiet-zone",
      passed: true,
      skipped: true,
      message: "The image is cropped too tight to check the quiet zone",
    });
  } else {
    let busy = 0;
    let ringTotal = 0;
    for (let y = ringBox.minY; y < ringBox.maxY; y++) {
      for (let x = ringBox.minX; x < ringBox.maxX; x++) {
        if (x >= minX && x < maxX && y >= minY && y < maxY) {
          continue;
        }
        const luma = lumaAt(full.data, (y * full.width + x) * 4);
        if (inverted ? luma > threshold : luma <= threshold) {
          busy++;
        }
        ringTotal++;
      }
    }
    // Rotated codes put some module pixels in the ring, so allow a little.
    if (busy / Math.max(ringTotal, 1) > 0.12) {
      penalty += 10;
      checks.push({
        id: "quiet-zone",
        passed: false,
        message: "Something dark touches the code; the quiet zone isn't clear",
        fix: "Leave clear space (about 4 modules) around the code",
      });
    } else {
      checks.push({
        id: "quiet-zone",
        passed: true,
        message: "Clear space around the code",
      });
    }
  }

  if (modulePx < 2) {
    checks.push({
      id: "resolution",
      passed: false,
      message: `Low resolution: about ${Math.round(modulePx * 10) / 10} px per module`,
      fix: "Use a larger image, or export the code at a bigger size",
    });
  } else {
    checks.push({
      id: "resolution",
      passed: true,
      message: `About ${Math.round(modulePx)} px per module`,
    });
  }

  // Decode the cropped code shrunk to each test size, with mild blur.
  const margin = Math.round(modulePx * 4);
  const cropX = Math.max(0, minX - margin);
  const cropY = Math.max(0, minY - margin);
  const cropWidth = Math.min(full.width, maxX + margin) - cropX;
  const cropHeight = Math.min(full.height, maxY + margin) - cropY;
  const drawCrop = (targetWidth: number) => {
    const scale = targetWidth / codeWidth;
    const test = createCanvas(cropWidth * scale, cropHeight * scale);
    test.ctx.drawImage(
      canvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      test.canvas.width,
      test.canvas.height
    );
    const image = test.ctx.getImageData(
      0,
      0,
      test.canvas.width,
      test.canvas.height
    );
    test.canvas.remove();
    return image;
  };
  const decodeChecks: ScanCheck[] = [];
  let largestFails = false;
  for (const [index, size] of sizes.entries()) {
    await nextTick();
    throwIfAborted(signal);
    const state = decodeAtSize(
      jsQR,
      drawCrop,
      size,
      dimension,
      (result) => result?.data === located.data
    );
    penalty += decodePenalty(index, sizes.length, state);
    decodeChecks.push(decodeCheck(size, sizes, state));
    if (index === sizes.length - 1 && state === "fail") {
      largestFails = true;
    }
  }
  canvas.remove();

  let score = Math.max(0, Math.min(100, 100 - penalty));
  if (largestFails) {
    score = Math.min(score, 30);
  }
  return {
    data: located.data,
    version,
    score,
    grade: gradeFor(score, largestFails),
    checks: [...decodeChecks, ...checks],
  };
}

// ── Raw pixels (Node and browsers) ─────────────────────────────────────────

export interface PixelScanResult {
  /** What the pixels decode to as they are, or null when no code was found */
  data: string | null;
  /** QR version of the code that was found, or null */
  version: number | null;
  /**
   * True when the pixels decode to `expected` as they are and, at every
   * check size, through the phone-camera model (two of three attempts)
   */
  passed: boolean;
}

/** Code widths (px) `scanQRPixels` checks through the camera model. */
export const PIXEL_SCAN_SIZES = [320] as const;

/** Area-average resize of RGBA pixels by `scale` (at most 1). */
function resizePixels(
  source: { data: Uint8ClampedArray; width: number; height: number },
  scale: number
): ImageData {
  const factor = Math.min(1, scale);
  const width = Math.max(1, Math.round(source.width * factor));
  const height = Math.max(1, Math.round(source.height * factor));
  const out = new Uint8ClampedArray(width * height * 4);
  const stepX = source.width / width;
  const stepY = source.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * stepY);
    const y1 = Math.max(
      y0 + 1,
      Math.min(source.height, Math.floor((y + 1) * stepY))
    );
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * stepX);
      const x1 = Math.max(
        x0 + 1,
        Math.min(source.width, Math.floor((x + 1) * stepX))
      );
      const sums = [0, 0, 0, 0];
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * source.width + sx) * 4;
          for (let c = 0; c < 4; c++) {
            sums[c] = (sums[c] as number) + (source.data[i + c] as number);
          }
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        out[o + c] = (sums[c] as number) / count;
      }
    }
  }
  return { data: out, width, height, colorSpace: "srgb" } as ImageData;
}

function decodedText(result: JsQRResult): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(result.binaryData)
    );
  } catch {
    return result.data;
  }
}

/**
 * Checks that raw RGBA pixels (from `decodePNGPixels`, `sharp().raw()` or a
 * canvas) hold a QR code that decodes to `expected`: as they are, and through
 * the phone-camera model (blur and contrast loss) with the code shrunk to each
 * of `sizes` px. Needs no DOM, so it runs in Node. Light-on-dark codes fail,
 * since many scanner apps can't read them.
 */
export async function scanQRPixels(
  pixels: QRArtPixels,
  expected: string,
  options: { sizes?: readonly number[] } = {}
): Promise<PixelScanResult> {
  const { width, height } = pixels;
  if (!(width > 0 && height > 0) || pixels.data.length < width * height * 4) {
    throw new Error("Pixels must be width × height × 4 RGBA bytes");
  }
  const jsQR = await loadDecoder();
  const source = {
    data:
      pixels.data instanceof Uint8ClampedArray
        ? pixels.data
        : Uint8ClampedArray.from(pixels.data),
    width,
    height,
  };
  const located = jsQR(source.data, width, height, {
    inversionAttempts: "dontInvert",
  });
  if (!located) {
    return { data: null, version: null, passed: false };
  }
  const data = decodedText(located);
  const { version, location } = located;
  if (!matches(located, expected)) {
    return { data, version, passed: false };
  }
  const dimension = 17 + 4 * version;
  const codeWidth =
    (distance(location.topLeftCorner, location.topRightCorner) +
      distance(location.bottomLeftCorner, location.bottomRightCorner) +
      distance(location.topLeftCorner, location.bottomLeftCorner) +
      distance(location.topRightCorner, location.bottomRightCorner)) /
    4;
  for (const size of options.sizes ?? PIXEL_SCAN_SIZES) {
    const state = decodeAtSize(
      jsQR,
      (target) => resizePixels(source, target / codeWidth),
      size,
      dimension,
      (result) => matches(result, expected)
    );
    if (state !== "pass") {
      return { data, version, passed: false };
    }
  }
  return { data, version, passed: true };
}
