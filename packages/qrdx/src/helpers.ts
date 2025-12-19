import type { QRProps } from "../types";
import { ERROR_LEVEL_MAP, FLAM_QR_LOGO } from "./constants";
import qrcodegen from "./codegen";
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
  level?: "L" | "M" | "Q" | "H";
  /** Output size in points (72 points = 1 inch) */
  size: number;
  /** Foreground/body color (hex, e.g., "#000000") */
  color: string;
  /** Background color (hex, e.g., "#FFFFFF") */
  backgroundColor: string;
  /** Eye/finder pattern color (hex, e.g., "#000000") */
  eyeColor?: string;
  /** Body pattern style (used to determine pixel rendering) */
  bodyPattern?: string;
  /** Corner eye pattern style (used to determine finder pattern rendering) */
  cornerEyePattern?: string;
  /** Output filename (defaults to "qr-code.eps") */
  filename?: string;
}

/**
 * Map body pattern string to EPS pixel style
 */
function mapBodyPatternToPixelStyle(bodyPattern?: string): "square" | "dot" | "rounded" {
  if (!bodyPattern) return "square";
  
  const pattern = bodyPattern.toLowerCase();
  if (pattern.includes("circle") || pattern.includes("dot")) {
    return "dot";
  }
  if (pattern.includes("rounded")) {
    return "rounded";
  }
  return "square";
}

/**
 * Map corner eye pattern string to EPS eye style
 */
function mapCornerEyePatternToEyeStyle(cornerEyePattern?: string): "square" | "circle" {
  if (!cornerEyePattern) return "square";
  
  const pattern = cornerEyePattern.toLowerCase();
  if (pattern.includes("circle") || pattern.includes("rounded") || pattern.includes("dot")) {
    return "circle";
  }
  return "square";
}

/**
 * Generate and download a QR code as an EPS file
 *
 * Creates a print-ready EPS file with CMYK colors.
 */
export async function downloadEPS(options: DownloadEPSOptions): Promise<void> {
  const {
    value,
    level = "M",
    size,
    color,
    backgroundColor,
    eyeColor,
    bodyPattern,
    cornerEyePattern,
    filename = "qr-code.eps",
  } = options;

  // Map patterns to EPS styles
  const pixelStyle = mapBodyPatternToPixelStyle(bodyPattern);
  const eyePatternStyle = mapCornerEyePatternToEyeStyle(cornerEyePattern);

  // Generate QR code using internal generator (same as index.tsx)
  const qr = qrcodegen.QrCode.encodeText(value, ERROR_LEVEL_MAP[level]);
  
  // getModules() returns boolean[][] directly - no conversion needed!
  const matrix = qr.getModules();

  // Generate EPS content
  const epsContent = generateEPS({
    matrix,
    size,
    color,
    backgroundColor,
    eyeColor: eyeColor || color,
    pixelStyle,
    eyePattern: eyePatternStyle,
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
