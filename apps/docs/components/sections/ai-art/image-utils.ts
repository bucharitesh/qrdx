import { handleImageLoad } from "qrdx";

export type ScanCheck =
  | "checking"
  | "scannable"
  | "mismatch"
  | "unreadable"
  | "unverified";

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

/** Decodes the artwork in the browser with qrdx's scanner and compares it with what was encoded. */
export async function checkScannable(
  imageUrl: string,
  expected: string,
): Promise<Exclude<ScanCheck, "checking">> {
  try {
    const img = await loadImage(imageUrl);
    if (!canReadPixels(img)) return "unverified";

    const decoded: unknown = await handleImageLoad(img, img.naturalWidth);
    if (typeof decoded !== "string" || decoded === "NO_QR") {
      return "unreadable";
    }
    return decoded === expected ? "scannable" : "mismatch";
  } catch {
    return "unverified";
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
