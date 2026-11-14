// Barcode detection: the browser's BarcodeDetector where it exists (Chrome on
// Android and macOS), otherwise the `barcode-detector` ponyfill (ZXing
// compiled to WebAssembly), loaded on first use.

export const SCAN_FORMATS = [
  "qr_code",
  "data_matrix",
  "aztec",
  "pdf417",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
] as const;

export type ScanFormat = (typeof SCAN_FORMATS)[number];

export const FORMAT_LABELS: Record<string, string> = {
  qr_code: "QR code",
  micro_qr_code: "Micro QR",
  rm_qr_code: "rMQR",
  data_matrix: "Data Matrix",
  aztec: "Aztec",
  pdf417: "PDF417",
  ean_13: "EAN-13",
  ean_8: "EAN-8",
  upc_a: "UPC-A",
  upc_e: "UPC-E",
  code_128: "Code 128",
  code_39: "Code 39",
};

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format.replace(/_/g, " ");
}

export interface DetectedCode {
  rawValue: string;
  format: string;
  cornerPoints: { x: number; y: number }[];
}

interface Detector {
  detect(source: ImageBitmapSource): Promise<
    {
      rawValue: string;
      format: string;
      cornerPoints: readonly { x: number; y: number }[];
    }[]
  >;
}

// A type alias, not an interface: Biome 2.3 crashes on interface construct signatures.
type DetectorConstructor = (new (options?: {
  formats?: string[];
}) => Detector) & {
  getSupportedFormats(): Promise<readonly string[]>;
};

export type DetectorEngine = "native" | "wasm";

let detectorPromise: Promise<{
  detector: Detector;
  engine: DetectorEngine;
}> | null = null;

async function createDetector(): Promise<{
  detector: Detector;
  engine: DetectorEngine;
}> {
  const Native = (globalThis as { BarcodeDetector?: DetectorConstructor })
    .BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = SCAN_FORMATS.filter((format) =>
        supported.includes(format),
      );
      if (formats.includes("qr_code")) {
        return { detector: new Native({ formats }), engine: "native" };
      }
    } catch {
      // Fall through to the WebAssembly reader.
    }
  }
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return {
    detector: new BarcodeDetector({ formats: [...SCAN_FORMATS] }),
    engine: "wasm",
  };
}

/** Shared detector, created once per page. */
export function getDetector(): Promise<{
  detector: Detector;
  engine: DetectorEngine;
}> {
  if (!detectorPromise) {
    detectorPromise = createDetector().catch((error) => {
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}

/** Detects every code in a frame, dropping duplicates of the same value. */
export async function detectCodes(
  source: ImageBitmapSource,
): Promise<DetectedCode[]> {
  const { detector } = await getDetector();
  const found = await detector.detect(source);
  const seen = new Set<string>();
  const codes: DetectedCode[] = [];
  for (const code of found) {
    const key = `${code.format}\u0000${code.rawValue}`;
    if (!code.rawValue || seen.has(key)) continue;
    seen.add(key);
    codes.push({
      rawValue: code.rawValue,
      format: code.format,
      cornerPoints: code.cornerPoints.map(({ x, y }) => ({ x, y })),
    });
  }
  return codes;
}

/** Codes in an uploaded, dropped or pasted image (EXIF rotation applied). */
export async function detectCodesInImage(blob: Blob): Promise<DetectedCode[]> {
  const bitmap = await createImageBitmap(blob);
  try {
    return await detectCodes(bitmap);
  } finally {
    bitmap.close();
  }
}
