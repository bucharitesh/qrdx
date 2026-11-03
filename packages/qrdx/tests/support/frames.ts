// Shared helpers for the frame spec tests: image comparison and the
// three sample payloads every official frame must scan with.
import type { RasterImage } from "./raster";

/** A short link, a Wi-Fi network with a 20-character password and a contact. */
export const SAMPLE_PAYLOADS = {
  link: "https://qrdx.dev/q/Ab3dE9x",
  wifi: "WIFI:T:WPA;S:Harbour Cafe Guest;P:sunlight-harbour-24;;",
  vcard: [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Rao;Asha;;;",
    "FN:Asha Rao",
    "ORG:Harbour Cafe",
    "TEL;TYPE=CELL:+44 20 7946 0958",
    "EMAIL:asha@example.com",
    "URL:https://example.com",
    "END:VCARD",
  ].join("\n"),
} as const;

export interface ImageDifference {
  /**
   * Share of pixels that differ by more than `threshold` in some channel
   * and have no match within one pixel in the other image (so edge
   * anti-aliasing and sub-pixel rounding don't count, a moved or missing
   * shape does)
   */
  differing: number;
  /** Mean absolute channel difference (0-255) */
  mean: number;
}

function distance(
  a: RasterImage,
  i: number,
  b: RasterImage,
  j: number
): number {
  let worst = 0;
  for (let c = 0; c < 3; c++) {
    worst = Math.max(
      worst,
      Math.abs((a.data[i * 4 + c] as number) - (b.data[j * 4 + c] as number))
    );
  }
  return worst;
}

/** True when pixel (x, y) of `a` has a match within one pixel in `b`. */
function matchesNearby(
  a: RasterImage,
  b: RasterImage,
  x: number,
  y: number,
  threshold: number
): boolean {
  const i = y * a.width + x;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= b.width || ny >= b.height) {
        continue;
      }
      if (distance(a, i, b, ny * b.width + nx) <= threshold) {
        return true;
      }
    }
  }
  return false;
}

/** Compares two images of the same size (see ImageDifference). */
export function compareImages(
  a: RasterImage,
  b: RasterImage,
  threshold = 48
): ImageDifference {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Image sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`
    );
  }
  let differing = 0;
  let total = 0;
  const pixels = a.width * a.height;
  for (let i = 0; i < pixels; i++) {
    for (let c = 0; c < 3; c++) {
      total += Math.abs(
        (a.data[i * 4 + c] as number) - (b.data[i * 4 + c] as number)
      );
    }
    if (distance(a, i, b, i) <= threshold) {
      continue;
    }
    const x = i % a.width;
    const y = Math.floor(i / a.width);
    if (
      !(
        matchesNearby(a, b, x, y, threshold) &&
        matchesNearby(b, a, x, y, threshold)
      )
    ) {
      differing++;
    }
  }
  return { differing: differing / pixels, mean: total / (pixels * 3) };
}
