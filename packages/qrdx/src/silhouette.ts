/** biome-ignore-all lint/style/noMagicNumbers: sampling constants */
// Silhouettes for `shape` (QRSilhouette): a picture's shape sampled into a
// small grid of cells, never the picture itself. A picture with see-through
// parts uses its alpha; an opaque one (a JPEG, a logo on white) uses its
// darkness, split at the threshold that best separates its tones, and a
// light shape on a dark ground is turned around. Specks and pinholes are
// cleaned up, the shape is cropped to its bounds and sampled so its longer
// side is QR_SILHOUETTE_MAX_CELLS cells.
import {
  QR_SILHOUETTE_MAX_CELLS,
  QR_SILHOUETTE_MIN_CELLS,
  type QRSilhouette,
} from "../types/qr";
import type { QRArtPixels } from "./art";

/** Fewest pixels across the shape itself (after cropping) worth tracing. */
const MIN_SHAPE_PIXELS = 16;
/** Islands and holes smaller than this share of the shape are cleaned up. */
const SPECK_SHARE = 0.01;

export interface QRSilhouetteOptions {
  /**
   * What makes a pixel part of the shape: "alpha" (opaque pixels), "dark"
   * (dark pixels, on white where see-through) or "auto" (default: alpha
   * when the picture has see-through parts, else dark).
   */
  mode?: "auto" | "alpha" | "dark";
  /** Cells along the longer side (8 to QR_SILHOUETTE_MAX_CELLS, default the max) */
  cells?: number;
}

/** The darkness threshold that best splits the tones (Otsu's method). */
function otsu(values: Float32Array): number {
  const bins = new Float64Array(256);
  for (const value of values) {
    bins[Math.min(255, Math.max(0, Math.round(value * 255)))]++;
  }
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (bins[i] as number);
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 128;
  for (let i = 0; i < 256; i++) {
    weightB += bins[i] as number;
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += i * (bins[i] as number);
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return (threshold + 0.5) / 255;
}

/** Which pixels belong to the shape. */
function inkMask(
  pixels: QRArtPixels,
  mode: NonNullable<QRSilhouetteOptions["mode"]>
): Uint8Array {
  const { width, height, data } = pixels;
  const count = width * height;
  const mask = new Uint8Array(count);
  let clear = 0;
  for (let i = 0; i < count; i++) {
    if ((data[i * 4 + 3] as number) < 128) clear++;
  }
  const useAlpha =
    mode === "alpha" ||
    (mode === "auto" && clear > count * 0.02 && clear < count * 0.98);
  if (useAlpha) {
    for (let i = 0; i < count; i++) {
      mask[i] = (data[i * 4 + 3] as number) >= 128 ? 1 : 0;
    }
    return mask;
  }
  // Darkness on white: see-through pixels count as paper
  const darkness = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = (data[i * 4 + 3] as number) / 255;
    const luma =
      0.2126 * (data[i * 4] as number) +
      0.7152 * (data[i * 4 + 1] as number) +
      0.0722 * (data[i * 4 + 2] as number);
    darkness[i] = 1 - (luma * a + 255 * (1 - a)) / 255;
  }
  const threshold = otsu(darkness);
  for (let i = 0; i < count; i++) {
    mask[i] = (darkness[i] as number) > threshold ? 1 : 0;
  }
  // A light shape on a dark ground: the ground covers most of the border
  let border = 0;
  let inked = 0;
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      border++;
      inked += mask[y * width + x] as number;
    }
  }
  for (let y = 1; y < height - 1; y++) {
    for (const x of [0, width - 1]) {
      border++;
      inked += mask[y * width + x] as number;
    }
  }
  if (inked > border / 2) {
    for (let i = 0; i < count; i++) mask[i] = mask[i] ? 0 : 1;
  }
  return mask;
}

/** Removes islands and fills holes smaller than `limit` cells (4-connected). */
function cleanSpecks(
  cells: Uint8Array,
  width: number,
  height: number,
  limit: number
) {
  for (const value of [1, 0]) {
    const seen = new Uint8Array(cells.length);
    for (let start = 0; start < cells.length; start++) {
      if (seen[start] || cells[start] !== value) continue;
      const component: number[] = [start];
      seen[start] = 1;
      let touchesEdge = false;
      // Grows while it is walked: for…of sees the pushed cells too
      for (const i of component) {
        const x = i % width;
        const y = (i - x) / width;
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          touchesEdge = true;
        }
        for (const [nx, ny] of [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ] as const) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (!seen[j] && cells[j] === value) {
            seen[j] = 1;
            component.push(j);
          }
        }
      }
      // Holes are light areas that don't reach the edge
      const speck = value === 1 || !touchesEdge;
      if (speck && component.length < limit) {
        for (const i of component) cells[i] = value ? 0 : 1;
      }
    }
  }
}

/**
 * Samples raw RGBA pixels (a canvas, `sharp().raw()`, …) into a silhouette
 * for `shape`. Works everywhere, no DOM needed. Throws when no shape is
 * found or it is too small to trace; check the result with
 * `getQRSilhouetteFit` before using it.
 */
export function createQRSilhouette(
  pixels: QRArtPixels,
  options: QRSilhouetteOptions = {}
): QRSilhouette {
  const { width, height, data } = pixels;
  if (!(width > 0 && height > 0) || data.length < width * height * 4) {
    throw new Error("Silhouette pixels must be width × height × 4 RGBA bytes");
  }
  const mask = inkMask(pixels, options.mode ?? "auto");
  // Specks and pinholes go before cropping, so a speck can't widen the crop
  const inked = mask.reduce((sum, cell) => sum + cell, 0);
  cleanSpecks(mask, width, height, Math.max(16, inked * SPECK_SHARE));
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) {
    throw new Error(
      "No shape found: use a picture with a dark or opaque shape on a light or clear background"
    );
  }
  const shapeWidth = x1 - x0 + 1;
  const shapeHeight = y1 - y0 + 1;
  if (Math.max(shapeWidth, shapeHeight) < MIN_SHAPE_PIXELS) {
    throw new Error("The shape is too small to trace; use a bigger picture");
  }
  const long = Math.min(
    Math.max(
      Math.round(options.cells ?? QR_SILHOUETTE_MAX_CELLS),
      QR_SILHOUETTE_MIN_CELLS
    ),
    QR_SILHOUETTE_MAX_CELLS
  );
  const scale = long / Math.max(shapeWidth, shapeHeight);
  // The grid keeps the shape's proportions; a very thin shape is padded to
  // the smallest grid (and then fails the fit check as thin)
  const gridWidth = Math.max(
    QR_SILHOUETTE_MIN_CELLS,
    Math.round(shapeWidth * scale)
  );
  const gridHeight = Math.max(
    QR_SILHOUETTE_MIN_CELLS,
    Math.round(shapeHeight * scale)
  );
  const innerWidth = Math.max(1, Math.round(shapeWidth * scale));
  const innerHeight = Math.max(1, Math.round(shapeHeight * scale));
  const padX = Math.floor((gridWidth - innerWidth) / 2);
  const padY = Math.floor((gridHeight - innerHeight) / 2);
  const cells = new Uint8Array(gridWidth * gridHeight);
  for (let gy = 0; gy < innerHeight; gy++) {
    const sy0 = y0 + Math.floor((gy * shapeHeight) / innerHeight);
    const sy1 = Math.max(
      sy0 + 1,
      y0 + Math.floor(((gy + 1) * shapeHeight) / innerHeight)
    );
    for (let gx = 0; gx < innerWidth; gx++) {
      const sx0 = x0 + Math.floor((gx * shapeWidth) / innerWidth);
      const sx1 = Math.max(
        sx0 + 1,
        x0 + Math.floor(((gx + 1) * shapeWidth) / innerWidth)
      );
      let ink = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++)
          ink += mask[sy * width + sx] as number;
      }
      // A cell is inside when the shape covers at least half of it
      cells[(gy + padY) * gridWidth + gx + padX] =
        ink * 2 >= (sy1 - sy0) * (sx1 - sx0) ? 1 : 0;
    }
  }
  const area = cells.reduce((sum, cell) => sum + cell, 0);
  cleanSpecks(cells, gridWidth, gridHeight, Math.max(4, area * SPECK_SHARE));
  if (!cells.includes(1)) {
    throw new Error("The shape is too small to trace; use a bigger picture");
  }
  return {
    type: "silhouette",
    width: gridWidth,
    height: gridHeight,
    cells: Array.from(cells, (cell) => (cell ? "1" : "0")).join(""),
  };
}

/** Longest side a picture is drawn at before sampling, in pixels. */
const LOAD_SIZE = 512;

async function toImage(
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
      img.onerror = () => reject(new Error("Could not load the picture"));
      img.src = url;
    });
  } finally {
    if (typeof source !== "string") {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

/**
 * Loads a picture (PNG, JPEG, SVG, … as a Blob, data URL, same-origin URL
 * or <img>) in the browser, draws it on a canvas and samples it with
 * `createQRSilhouette`. The picture itself is never kept: an SVG is drawn
 * as an image (no scripts run) and only the grid comes back.
 */
export async function loadQRSilhouette(
  source: string | Blob | HTMLImageElement,
  options: QRSilhouetteOptions = {}
): Promise<QRSilhouette> {
  if (typeof document === "undefined") {
    throw new Error(
      "loadQRSilhouette needs a browser; pass decoded pixels to createQRSilhouette instead"
    );
  }
  const img = await toImage(source);
  // An SVG without a size reports 0 (or 150): draw it at the load size
  const naturalWidth = img.naturalWidth || img.width || LOAD_SIZE;
  const naturalHeight = img.naturalHeight || img.height || LOAD_SIZE;
  const fit = LOAD_SIZE / Math.max(naturalWidth, naturalHeight);
  const width = Math.max(1, Math.round(naturalWidth * fit));
  const height = Math.max(1, Math.round(naturalHeight * fit));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Could not get a canvas context");
  }
  ctx.drawImage(img, 0, 0, width, height);
  let pixels: ImageData;
  try {
    pixels = ctx.getImageData(0, 0, width, height);
  } catch {
    throw new Error(
      "Could not read the picture (cross-origin images need CORS); upload it instead"
    );
  } finally {
    canvas.remove();
  }
  return createQRSilhouette(pixels, options);
}
