// WebP from a canvas in any browser. Canvas encoders differ: Chrome writes
// lossless WebP at quality 1, but Safari can't encode WebP at all and hands
// back a PNG for toBlob("image/webp"). So the result is checked by its bytes,
// and the built-in lossless encoder (utils/webp.ts) takes over whenever the
// browser's file isn't the WebP that was asked for. A PNG is never passed
// off as WebP.

import { encodeWebPLossless, getWebPCompression } from "./utils/webp";

export {
  encodeWebPLossless,
  getWebPCompression,
  isWebPFile,
  WEBP_MAX_DIMENSION,
} from "./utils/webp";

export interface WebPOptions {
  /**
   * 0 to 1 for a smaller lossy file, whose edges and colors can soften.
   * Leave it out for lossless (the default), which keeps every pixel, and so
   * the code's edges, exact. Browsers that can't encode WebP get a lossless
   * file either way.
   */
  quality?: number;
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  if (typeof canvas.toBlob !== "function") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * A canvas as WebP: lossless unless `options.quality` is set. The browser
 * encodes it when it can; otherwise (Safari) the built-in lossless encoder
 * does. Transparency is kept.
 */
export async function canvasToWebP(
  canvas: HTMLCanvasElement,
  options: WebPOptions = {}
): Promise<Blob> {
  const lossy = options.quality !== undefined;
  const quality = lossy ? Math.min(1, Math.max(0, Number(options.quality))) : 1;
  const native = await canvasBlob(canvas, "image/webp", quality);
  if (native) {
    const bytes = new Uint8Array(await native.arrayBuffer());
    const compression = getWebPCompression(bytes);
    if (compression === "lossless" || (lossy && compression === "lossy")) {
      return new Blob([bytes], { type: "image/webp" });
    }
  }
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get canvas context");
  }
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const file = encodeWebPLossless(data, canvas.width, canvas.height);
  return new Blob([file as BlobPart], { type: "image/webp" });
}

const BASE64_CHUNK = 0x80_00;

/** A blob as a base64 data URL (no FileReader, so it also runs in Node). */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK) {
    binary += String.fromCharCode(
      ...bytes.subarray(start, start + BASE64_CHUNK)
    );
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}
