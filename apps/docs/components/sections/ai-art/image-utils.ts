import { getImageScanScore } from "qrdx";
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
 * Prepares an uploaded reference image: at most 512 px, grayscale (only its
 * light and dark shapes are used) and JPEG, so the request stays small.
 */
export async function prepareReferenceImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height);
    const { data } = pixels;
    for (let i = 0; i < data.length; i += 4) {
      const luma = Math.round(
        0.299 * (data[i] ?? 0) +
          0.587 * (data[i + 1] ?? 0) +
          0.114 * (data[i + 2] ?? 0),
      );
      data[i] = luma;
      data[i + 1] = luma;
      data[i + 2] = luma;
    }
    ctx.putImageData(pixels, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    canvas.remove();
    if (dataUrl.length > (ART_REFERENCE_MAX_BYTES * 4) / 3) {
      throw new Error("This image is too large after resizing");
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Cross-origin `<a download>` is ignored by browsers, so fetch the file and save it as a blob. */
export async function downloadImage(
  imageUrl: string,
  fileName: string,
): Promise<void> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${fileName}.${EXTENSIONS[blob.type] ?? "png"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    window.open(imageUrl, "_blank", "noopener,noreferrer");
  }
}
