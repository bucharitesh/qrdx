/** biome-ignore-all lint/style/noMagicNumbers: scoring weights and thresholds */
import type { QRCode as JsQRResult } from "jsqr";
import type { ColorConfig, ErrorLevel, QRProps } from "../types";
import { normalizeColorConfig } from "../types/color";
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
import { FRAME_GAP_RATIO, getFrameDimensions, isFrameActive } from "./frame";
import { getQRAsSVGDataUri } from "./index";
import { getStylePairRisk } from "./scan-risk";
import { getImageSettings, getLuminance, resolveErrorLevel } from "./utils";
import { parseColor, type RGBAColor } from "./utils/parse-color";

export type ScanGrade = "great" | "ok" | "risky" | "fails";

export interface ScanCheck {
  id: string;
  passed: boolean;
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

/** Share of codewords each error correction level can recover. */
const EC_CAPACITY: Record<ErrorLevel, number> = {
  L: 0.07,
  M: 0.15,
  Q: 0.25,
  H: 0.3,
};

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

function colorStops(color: ColorConfig | undefined, fallback: string) {
  const normalized = normalizeColorConfig(color, fallback);
  return normalized.type === "solid"
    ? [normalized.color]
    : normalized.stops.map((stop) => stop.color);
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

function contrastChecks(props: QRProps): {
  checks: ScanCheck[];
  penalty: number;
  fails: boolean;
} {
  const fg = props.fgColor ?? DEFAULT_FGCOLOR;
  const darkColors = [
    ...colorStops(fg, DEFAULT_FGCOLOR),
    ...colorStops(props.eyeColor ?? fg, DEFAULT_FGCOLOR),
    ...colorStops(props.dotColor ?? fg, DEFAULT_FGCOLOR),
  ];
  const lightColors = colorStops(props.bgColor, DEFAULT_BGCOLOR);
  const white: RGBAColor = { r: 255, g: 255, b: 255, a: 1 };
  // A transparent background prints on whatever is behind it; assume paper.
  const background = lightColors.map((color) => {
    const parsed = toRGBA(color);
    return parsed && parsed.a > 0.5 ? parsed : white;
  });
  const foreground = darkColors
    .map(toRGBA)
    .filter((color): color is RGBAColor => color !== null);

  if (foreground.length === 0) {
    return { checks: [], penalty: 0, fails: false };
  }

  let worst = Number.POSITIVE_INFINITY;
  let inverted = false;
  for (const dark of foreground) {
    for (const light of background) {
      const darkLum = luminanceOf(dark);
      const lightLum = luminanceOf(light);
      worst = Math.min(worst, ratioOf(darkLum, lightLum));
      if (darkLum > lightLum) {
        inverted = true;
      }
    }
  }

  const ratio = Math.round(worst * 10) / 10;
  const checks: ScanCheck[] = [];
  let penalty = 0;
  if (worst >= 4.5) {
    checks.push({
      id: "contrast",
      passed: true,
      message: `Contrast ${ratio}:1 between code and background`,
    });
  } else {
    penalty = worst < 1.5 ? 60 : worst < 3 ? 30 : 10;
    checks.push({
      id: "contrast",
      passed: false,
      message: `Low contrast (${ratio}:1); 4.5:1 or more scans reliably`,
      fix: "Use a darker code color or a lighter background",
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
  return { checks, penalty, fails: worst < 1.5 };
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
    props.margin ?? DEFAULT_MARGIN,
    imageSettings
  );
  if (!settings) {
    return { check: null, penalty: 0 };
  }
  const area = settings.excavation
    ? settings.excavation.w * settings.excavation.h
    : settings.w * settings.h;
  const coverage = area / (cells.length * cells.length);
  const level = resolveErrorLevel(props);
  const capacity = EC_CAPACITY[level];
  const ratio = coverage / capacity;
  const percent = Math.round(coverage * 100);
  const message = `Logo covers ${percent}% of the code; level ${level} recovers about ${Math.round(capacity * 100)}%`;
  if (ratio <= 0.5) {
    return { check: { id: "logo", passed: true, message }, penalty: 0 };
  }
  return {
    check: {
      id: "logo",
      passed: false,
      message,
      fix:
        level === "H"
          ? "Use a smaller logo"
          : "Switch error correction to H or use a smaller logo",
    },
    penalty: ratio > 0.8 ? 25 : 10,
  };
}

function quietZoneCheck(props: QRProps): { check: ScanCheck; penalty: number } {
  const margin = props.margin ?? DEFAULT_MARGIN;
  const count = moduleCount(props).length + 2 * margin;
  // A frame keeps a light gap around the code.
  const modules =
    margin + (isFrameActive(props.frame) ? FRAME_GAP_RATIO * count : 0);
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
  const sizes = [...(options.sizes ?? SCAN_TEST_SIZES)]
    .filter((size) => size > 0)
    .sort((a, b) => a - b);

  const checks: ScanCheck[] = [];
  let penalty = 0;

  const contrast = contrastChecks(props);
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
  if (pairRisk) {
    penalty += 10;
  }

  const jsQR = await loadDecoder();
  throwIfAborted(signal);

  const sourceProps = await inlineLogo(
    withQRSize({ ...props, size: props.size ?? DEFAULT_SIZE }, SOURCE_SIZE)
  );
  throwIfAborted(signal);
  const svgUri = await getQRAsSVGDataUri(sourceProps);
  const img = await loadImage(svgUri);
  throwIfAborted(signal);

  const artwork = getFrameDimensions(SOURCE_SIZE, props.frame);
  const modules =
    moduleCount(props).length + 2 * (props.margin ?? DEFAULT_MARGIN);
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
  const decodeChecks: ScanCheck[] = [];
  let largestFails = false;

  for (const [index, size] of sizes.entries()) {
    await nextTick();
    throwIfAborted(signal);
    const state = decodeAtSize(jsQR, drawArtwork, size, modules, (result) =>
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
