import { getImageScanScore } from "qrdx";
import { soundEvent } from "@/lib/sound/emit";
import { ART_REFERENCE_MAX_BYTES, ART_REFERENCE_MAX_SIDE } from "./config";

export type ScanStatus =
  | "checking"
  | "scannable"
  | "mismatch"
  | "unreadable"
  | "unverified";

export interface ScanCheckResult {
  status: Exclude<ScanStatus, "checking">;
  /** 0–100 from qrdx's image scan score, when the code decoded */
  score: number | null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/** False when the image host blocks canvas reads (no CORS), so a decode result would be meaningless. */
function canReadPixels(img: HTMLImageElement): boolean {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, 1, 1);
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decodes the artwork in the browser with qrdx's image scan score (shrunk,
 * blurred and contrast checks) and compares it with what was encoded.
 */
export async function checkScannable(
  imageUrl: string,
  expected: string,
): Promise<ScanCheckResult> {
  try {
    const img = await loadImage(imageUrl);
    if (!canReadPixels(img)) return { status: "unverified", score: null };
    const result = await getImageScanScore(img);
    if (result.data === null) return { status: "unreadable", score: null };
    if (result.data !== expected) return { status: "mismatch", score: null };
    return { status: "scannable", score: result.score };
  } catch {
    return { status: "unverified", score: null };
  }
}

/** Index of the scannable variant with the best score, or -1. */
export function pickBestScannable(
  checks: (ScanCheckResult | undefined)[],
): number {
  let best = -1;
  let bestScore = -1;
  checks.forEach((check, index) => {
    if (check?.status === "scannable" && (check.score ?? 0) > bestScore) {
      best = index;
      bestScore = check.score ?? 0;
    }
  });
  return best;
}

/**
 * Prepares a reference image (an upload, or the editor's logo as a data:
 * URL): at most 512 px and JPEG, so the request stays small. Colors are
 * kept: the model can carry them into the artwork.
 */
export async function prepareReferenceImage(
  source: Blob | string,
): Promise<string> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const scale = Math.min(
      1,
      ART_REFERENCE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read this image");
    // JPEG has no transparency: transparent logos go on white.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    canvas.remove();
    if (dataUrl.length > (ART_REFERENCE_MAX_BYTES * 4) / 3) {
      throw new Error("This image is too large after resizing");
    }
    return dataUrl;
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** A data: URL as a Blob, without fetch (the CSP keeps data: out of connect-src). */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const type = dataUrl.slice(5, dataUrl.indexOf(";")) || "image/png";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Saves a Blob under `fileName` (the extension comes from its type). */
export function saveBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${fileName}.${EXTENSIONS[blob.type] ?? "png"}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  soundEvent("download");
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/** Saves a generated image (a data: URL) as a file. */
export function downloadImage(imageUrl: string, fileName: string): void {
  saveBlob(dataUrlToBlob(imageUrl), fileName);
}

/**
 * The print-size copy: the artwork resampled to `size` px in the browser,
 * then decoded again. Null when that copy doesn't scan to `expected`.
 */
export async function createPrintImage(
  imageUrl: string,
  expected: string,
  size: number,
): Promise<Blob | null> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a canvas context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  canvas.remove();
  if (!blob) return null;
  const check = await getImageScanScore(blob);
  return check.data === expected ? blob : null;
}
