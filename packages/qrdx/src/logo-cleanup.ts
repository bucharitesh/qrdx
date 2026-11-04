/** biome-ignore-all lint/style/noMagicNumbers: color distances */
// Removes a logo's solid background (a white or colored box around the
// mark, as JPEGs and many PNGs have). Detection is Logo QR's: the four
// corners share one opaque color (art-trace's backdropColor). Unlike Logo
// QR's global key, only pixels connected to the border fade out, so the
// same color inside the mark (white letters on a white-boxed logo) stays.
import { backdropColor, type RGB } from "./art-trace";

export interface LogoPixels {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel */
  data: Uint8ClampedArray | Uint8Array;
}

/** sRGB distance (0–1 channels) below which a pixel is all background */
const CLEAR = 0.06;
/** Above this a pixel is all logo; in between it fades (anti-aliased edges) */
const SOLID = 0.16;

/**
 * Longest side the browser helper works at (larger logos are scaled down):
 * plenty for a logo at 30% of a print, and the PNG stays small enough to
 * save with a design.
 */
export const LOGO_CLEANUP_MAX_SIDE = 512;

/**
 * `pixels` with the background made transparent, or null when the image has
 * no solid background (transparent or mixed corners). Edge pixels keep
 * their own color: the background's share is taken out as they fade.
 */
export function removeLogoBackdrop(pixels: LogoPixels): LogoPixels | null {
  const { width, height } = pixels;
  if (!(width > 0 && height > 0) || pixels.data.length < width * height * 4) {
    return null;
  }
  const source = Uint8Array.from(pixels.data);
  const backdrop = backdropColor({ width, height, data: source });
  if (!backdrop) {
    return null;
  }
  const distance = (p: number) => {
    const i = p * 4;
    return Math.hypot(
      (source[i] as number) / 255 - backdrop[0],
      (source[i + 1] as number) / 255 - backdrop[1],
      (source[i + 2] as number) / 255 - backdrop[2]
    );
  };

  // Flood fill from the border through background-like pixels
  const reached = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const visit = (p: number) => {
    if (reached[p] || (source[p * 4 + 3] as number) === 0) return;
    if (distance(p) >= SOLID) return;
    reached[p] = 1;
    queue[tail++] = p;
  };
  for (let x = 0; x < width; x++) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (head < tail) {
    const p = queue[head++] as number;
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < (height - 1) * width) visit(p + width);
  }

  const out = new Uint8ClampedArray(source);
  const background: RGB = backdrop;
  for (let p = 0; p < width * height; p++) {
    if (!reached[p]) continue;
    const keep = Math.min(
      1,
      Math.max(0, (distance(p) - CLEAR) / (SOLID - CLEAR))
    );
    const i = p * 4;
    out[i + 3] = Math.round((source[i + 3] as number) * keep);
    if (keep > 0 && keep < 1) {
      // Take the background's share out of the edge color
      for (let c = 0; c < 3; c++) {
        const value = (source[i + c] as number) / 255;
        const own = (value - (1 - keep) * (background[c] as number)) / keep;
        out[i + c] = Math.round(Math.min(1, Math.max(0, own)) * 255);
      }
    }
  }
  return { width, height, data: out };
}

/**
 * Browser: the logo at `src` (a data URL or a same-origin or CORS-enabled
 * URL) with its solid background removed, as a PNG data URL, or null when
 * it has none or can't be read. Logos larger than 512 px are scaled down.
 */
export async function removeLogoBackground(
  src: string
): Promise<string | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("removeLogoBackground needs a browser (canvas)");
  }
  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  if (!image) return null;
  const naturalWidth = image.naturalWidth || 512;
  const naturalHeight = image.naturalHeight || 512;
  const scale = Math.min(
    1,
    LOGO_CLEANUP_MAX_SIDE / Math.max(naturalWidth, naturalHeight)
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const cleaned = removeLogoBackdrop(frame);
    if (!cleaned) return null;
    frame.data.set(cleaned.data);
    ctx.putImageData(frame, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    // A tainted canvas (a cross-origin logo without CORS)
    return null;
  } finally {
    canvas.remove();
  }
}
