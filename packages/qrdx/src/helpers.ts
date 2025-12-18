import type { QRProps } from "../types";
import { FLAM_QR_LOGO } from "./constants";
import QRCode from "qrcode";
import { generateEPS } from "./utils/eps-generator";

// EPS Generator re-exports
export { generateEPS } from "./utils/eps-generator";
export type { GenerateEPSOptions, CMYKColor } from "./utils/eps-generator";

interface QRDataProps extends QRProps {
  hideLogo?: boolean;
  logo?: string;
}

interface QRDataResult extends QRProps {
  size: number; // Required in result
}

export function getQRData({
  value,
  size = 1024,
  fgColor,
  bgColor,
  eyeColor,
  dotColor,
  bodyPattern,
  hideLogo,
  logo,
  margin,
  cornerEyePattern,
  cornerEyeDotPattern,
  level,
  templateId,
}: QRDataProps): QRDataResult {
  return {
    value: `${value}`,
    bgColor,
    fgColor,
    eyeColor,
    dotColor,
    bodyPattern,
    cornerEyePattern,
    cornerEyeDotPattern,
    level,
    templateId,
    size,
    margin,
    ...(!hideLogo && {
      imageSettings: {
        src: logo || FLAM_QR_LOGO,
        height: 256,
        width: 256,
        excavate: true,
      },
    }),
  };
}

export interface DownloadEPSOptions {
  /** The QR code value/URL to encode */
  value: string;
  /** Error correction level: L, M, Q, H */
  level: "L" | "M" | "Q" | "H";
  /** Output size in points (72 points = 1 inch) */
  size: number;
  /** Foreground color (hex, e.g., "#000000") */
  color: string;
  /** Background color (hex, e.g., "#FFFFFF") */
  backgroundColor: string;
  /** Output filename (defaults to "qr-code.eps") */
  filename?: string;
}

/**
 * Generate and download a QR code as an EPS file
 *
 * Creates a print-ready EPS file with CMYK colors.
 *
 * @param options - Download options including value, colors, and size
 */
export async function downloadEPS(options: DownloadEPSOptions): Promise<void> {
  const {
    value,
    level,
    size,
    color,
    backgroundColor,
    filename = "qr-code.eps",
  } = options;

  // Generate QR code data using qrcode library
  const qrData = QRCode.create(value, {
    errorCorrectionLevel: level,
  });

  // Extract module data
  // qrData.modules is an object with:
  // - data: Uint8Array (flat array of 0s and 1s)
  // - size: number (width/height of the square matrix)
  const { data, size: moduleSize } = qrData.modules;

  // Convert flat Uint8Array to 2D boolean array
  const matrix: boolean[][] = [];
  for (let row = 0; row < moduleSize; row++) {
    const rowData: boolean[] = [];
    for (let col = 0; col < moduleSize; col++) {
      const index = row * moduleSize + col;
      rowData.push(data[index] === 1);
    }
    matrix.push(rowData);
  }

  // Generate EPS content
  const epsContent = generateEPS({
    matrix,
    size,
    color,
    backgroundColor,
  });

  // Trigger browser download
  const blob = new Blob([epsContent], { type: "application/postscript" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".eps") ? filename : `${filename}.eps`;
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();

  // Cleanup to prevent memory leaks
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
