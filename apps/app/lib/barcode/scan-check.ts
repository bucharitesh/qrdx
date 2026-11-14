// The barcode generator's scan check: decodes the PNG it would download with
// ZXing (the `barcode-detector` ponyfill, ZXing compiled to WebAssembly, the
// same decoder /scan falls back to), and compares the result with the value
// drawn. Always the WebAssembly reader, never the browser's own
// BarcodeDetector, so every browser gets the same answer.
import type { BarcodeFormat as DetectorFormat } from "barcode-detector/ponyfill";
import {
  BARCODE_FORMATS,
  type BarcodeFormatId,
  decodedMatches,
  getBarcodeFormat,
} from "./formats";

/** Every format the generator draws, as BarcodeDetector names. */
export const SCAN_CHECK_FORMATS = [
  ...new Set(BARCODE_FORMATS.flatMap((format) => format.detectorFormats)),
] as DetectorFormat[];

interface Detector {
  detect(
    source: ImageBitmapSource,
  ): Promise<{ rawValue: string; format: string }[]>;
}

let detectorPromise: Promise<Detector> | null = null;

function getDetector(): Promise<Detector> {
  if (!detectorPromise) {
    detectorPromise = import("barcode-detector/ponyfill")
      .then(
        ({ BarcodeDetector }) =>
          new BarcodeDetector({ formats: SCAN_CHECK_FORMATS }) as Detector,
      )
      .catch((error) => {
        detectorPromise = null;
        throw error;
      });
  }
  return detectorPromise;
}

export type ScanCheckResult =
  | { status: "pass"; decoded: string }
  | { status: "mismatch"; decoded: string; format: string }
  | { status: "fail" };

/** Decodes `image` and checks it reads back as `value` in format `id`. */
export async function checkBarcodeScan(
  image: ImageBitmapSource,
  id: BarcodeFormatId,
  value: string,
): Promise<ScanCheckResult> {
  const detector = await getDetector();
  const found = await detector.detect(image);
  const expected = getBarcodeFormat(id).detectorFormats as readonly string[];
  const ofFormat = found.filter((code) => expected.includes(code.format));
  const match = ofFormat.find((code) =>
    decodedMatches(id, value, code.rawValue),
  );
  if (match) return { status: "pass", decoded: match.rawValue };
  const other = ofFormat[0] ?? found[0];
  return other
    ? { status: "mismatch", decoded: other.rawValue, format: other.format }
    : { status: "fail" };
}
