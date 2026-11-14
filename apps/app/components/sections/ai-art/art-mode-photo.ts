// Photo mode's photo, prepared in the browser: cropped square, downsized to
// ART_PHOTO_MAX_SIDE and sent as JPEG, so the request stays well under the
// body limit. The photo is never stored: it goes with the request to the art
// model and is dropped (lib/ai/art-image.ts).

import { ART_PHOTO_MAX_BYTES, ART_PHOTO_MAX_SIDE } from "./config";

/** Photo types the picker accepts (sent on as JPEG). */
export const ART_PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
/** Largest photo file read (phone photos run to several MB). */
export const ART_PHOTO_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

/** JPEG qualities tried in turn until the photo fits ART_PHOTO_MAX_BYTES. */
const QUALITIES = [0.88, 0.8, 0.7, 0.6];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read this image"));
    img.src = src;
  });
}

/** Bytes a base64 data: URL decodes to. */
const dataUrlBytes = (url: string) =>
  Math.floor(((url.length - url.indexOf(",") - 1) * 3) / 4);

/**
 * The square of a `width` × `height` image that `focus` picks: 0 is the
 * left (or top) edge of the long side, 1 the right (or bottom), 0.5 the
 * center (exported for tests).
 */
export function photoCrop(
  width: number,
  height: number,
  focus = 0.5,
): { x: number; y: number; side: number } {
  const side = Math.min(width, height);
  const t = Math.min(Math.max(focus, 0), 1);
  return {
    x: Math.round((width - side) * t),
    y: Math.round((height - side) * t),
    side,
  };
}

export interface PreparedPhoto {
  /** A JPEG data: URL, square, at most ART_PHOTO_MAX_SIDE */
  dataUrl: string;
  /** Which way the crop can move: the photo wasn't square */
  orientation: "landscape" | "portrait" | "square";
}

/** `file` cropped square at `focus` (see photoCrop) and downsized, as JPEG. */
export async function preparePhotoImage(
  file: Blob,
  focus = 0.5,
): Promise<PreparedPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const { x, y, side } = photoCrop(width, height, focus);
    const size = Math.max(1, Math.min(ART_PHOTO_MAX_SIDE, side));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't read this image");
    // JPEG has no transparency: transparent areas go on white.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, side, side, 0, 0, size, size);
    let dataUrl = "";
    for (const quality of QUALITIES) {
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrlBytes(dataUrl) <= ART_PHOTO_MAX_BYTES) break;
    }
    canvas.remove();
    if (dataUrlBytes(dataUrl) > ART_PHOTO_MAX_BYTES) {
      throw new Error("This photo is too large after resizing");
    }
    return {
      dataUrl,
      orientation:
        width === height ? "square" : width > height ? "landscape" : "portrait",
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
