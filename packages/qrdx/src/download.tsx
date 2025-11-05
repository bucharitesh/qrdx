import type { QRProps } from "../types";
import { DEFAULT_SIZE } from "./constants";
import { getQRAsCanvas, getQRAsSVGDataUri } from "./index";

// Lazy load PDF/EPS libraries
async function loadPdfLibraries() {
  const [jsPDF, svg2pdfModule] = await Promise.all([
    import("jspdf"),
    import("svg2pdf.js"),
  ]);
  return { jsPDF: jsPDF.jsPDF, svg2pdf: svg2pdfModule.svg2pdf };
}

export type DownloadFormat = "png" | "jpg" | "svg" | "pdf" | "eps";

export type DownloadSize = {
  width: number;
  height: number;
};

export const PRESET_SIZES: Record<string, DownloadSize> = {
  small: { width: 200, height: 200 },
  medium: { width: 400, height: 400 },
  large: { width: 800, height: 800 },
  xlarge: { width: 1200, height: 1200 },
  "2xl": { width: 1600, height: 1600 },
  "3xl": { width: 2000, height: 2000 },
};

export type DownloadOptions = {
  format: DownloadFormat;
  size: DownloadSize;
  filename?: string;
};

/**
 * Validates if a size value is within acceptable bounds
 */
export function validateSize(
  width: number,
  height: number
): {
  isValid: boolean;
  error?: string;
} {
  const MIN_SIZE = 50;
  const MAX_SIZE = 5000;

  if (width < MIN_SIZE || height < MIN_SIZE) {
    return {
      isValid: false,
      error: `Size must be at least ${MIN_SIZE}x${MIN_SIZE} pixels`,
    };
  }

  if (width > MAX_SIZE || height > MAX_SIZE) {
    return {
      isValid: false,
      error: `Size must not exceed ${MAX_SIZE}x${MAX_SIZE} pixels`,
    };
  }

  if (width !== height) {
    return {
      isValid: false,
      error: "Width and height must be equal for QR codes",
    };
  }

  return { isValid: true };
}

/**
 * Downloads a file to the user's device
 */
function downloadFile(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Get the MIME type for a given format
 */
function getMimeType(format: DownloadFormat): string {
  switch (format) {
    case "png":
      return "image/png";
    case "jpg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    case "eps":
      return "application/postscript";
    default:
      return "image/png";
  }
}

/**
 * Get the file extension for a given format
 */
function getFileExtension(format: DownloadFormat): string {
  return format === "jpg" ? "jpg" : format;
}

/**
 * Converting SVG string to PDF blob
 */
async function svgToPdf(
  svgString: string,
  width: number,
  height: number
): Promise<Blob> {
  const { jsPDF, svg2pdf } = await loadPdfLibraries();

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = svgString;
  const svgElement = tempDiv.querySelector("svg");

  if (!svgElement) {
    throw new Error("Invalid SVG string");
  }

  // creating PDF with dimensions matching the QR code (in mm, at 72 DPI)
  const widthMm = (width * 25.4) / 72;
  const heightMm = (height * 25.4) / 72;
  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "mm",
    format: [widthMm, heightMm],
  });

  // converting SVG to PDF
  await svg2pdf(svgElement, pdf, {
    x: 0,
    y: 0,
    width: widthMm,
    height: heightMm,
  });

  tempDiv.remove();
  return pdf.output("blob");
}

/**
 * Converting SVG string to EPS format
 */
function svgToEps(svgString: string, width: number, height: number): string {
  // parsing the SVG to extract elements
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = svgString;
  const svgElement = tempDiv.querySelector("svg");

  if (!svgElement) {
    throw new Error("Invalid SVG string");
  }

  // Generate EPS header
  const epsHeader = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${width} ${height}
%%HiResBoundingBox: 0.000000 0.000000 ${width}.000000 ${height}.000000
%%Creator: QRDX QR Code Generator
%%Title: QR Code
%%CreationDate: ${new Date().toISOString()}
%%DocumentData: Clean7Bit
%%Origin: 0 0
%%LanguageLevel: 2
%%Pages: 1
%%Page: 1 1
`;

  let epsBody = "";
  epsBody += `gsave\n`;
  epsBody += `0 ${height} translate\n`;
  epsBody += `1 -1 scale\n`;

  // Extract paths and rectangles from SVG
  const paths = svgElement.querySelectorAll("path");
  const rects = svgElement.querySelectorAll("rect");

  // Convert SVG background (usually first rect)
  rects.forEach((rect, index) => {
    const x = Number.parseFloat(rect.getAttribute("x") || "0");
    const y = Number.parseFloat(rect.getAttribute("y") || "0");
    const w = Number.parseFloat(rect.getAttribute("width") || "0");
    const h = Number.parseFloat(rect.getAttribute("height") || "0");
    const fill = rect.getAttribute("fill") || "#000000";

    // Convert color to RGB
    const rgb = hexToRgb(fill);
    epsBody += `${rgb.r} ${rgb.g} ${rgb.b} setrgbcolor\n`;
    epsBody += `newpath\n`;
    epsBody += `${x} ${y} moveto\n`;
    epsBody += `${x + w} ${y} lineto\n`;
    epsBody += `${x + w} ${y + h} lineto\n`;
    epsBody += `${x} ${y + h} lineto\n`;
    epsBody += `closepath\nfill\n`;
  });

  // converting SVG paths to EPS paths
  paths.forEach((path) => {
    const d = path.getAttribute("d") || "";
    const fill = path.getAttribute("fill") || "#000000";
    const rgb = hexToRgb(fill);
    epsBody += `${rgb.r} ${rgb.g} ${rgb.b} setrgbcolor\n`;

    // converting SVG path data to PostScript
    const epsPath = convertSvgPathToEps(d);
    epsBody += epsPath;
    epsBody += `fill\n`;
  });

  epsBody += `grestore\n`;
  const epsFooter = `%%EOF\n`;
  tempDiv.remove();

  return epsHeader + epsBody + epsFooter;
}

/**
 * Converting hex color to RGB values (0-1 range for PostScript)
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  // Remove # if present
  hex = hex.replace("#", "");

  const r = Number.parseInt(hex.substring(0, 2), 16) / 255;
  const g = Number.parseInt(hex.substring(2, 4), 16) / 255;
  const b = Number.parseInt(hex.substring(4, 6), 16) / 255;

  return { r, g, b };
}

/**
 * Converting SVG path data to PostScript path commands
 */
function convertSvgPathToEps(pathData: string): string {
  let epsPath = "newpath\n";
  const commands = pathData.match(/[a-zA-Z][^a-zA-Z]*/g) || [];

  for (const command of commands) {
    const type = command[0];
    const coords = command
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    switch (type) {
      case "M": // Move to (absolute)
        epsPath += `${coords[0]} ${coords[1]} moveto\n`;
        break;
      case "m": // Move to (relative)
        epsPath += `${coords[0]} ${coords[1]} rmoveto\n`;
        break;
      case "L": // Line to (absolute)
        epsPath += `${coords[0]} ${coords[1]} lineto\n`;
        break;
      case "l": // Line to (relative)
        epsPath += `${coords[0]} ${coords[1]} rlineto\n`;
        break;
      case "H": // Horizontal line (absolute)
        epsPath += `${coords[0]} currentpoint exch pop lineto\n`;
        break;
      case "h": // Horizontal line (relative)
        epsPath += `${coords[0]} 0 rlineto\n`;
        break;
      case "V": // Vertical line (absolute)
        epsPath += `currentpoint pop ${coords[0]} lineto\n`;
        break;
      case "v": // Vertical line (relative)
        epsPath += `0 ${coords[0]} rlineto\n`;
        break;
      case "Z":
      case "z": // Close path
        epsPath += `closepath\n`;
        break;
      // Add more path commands as needed
    }
  }

  return epsPath;
}

/**
 * Downloads a QR code with the specified options
 */
export async function downloadQRCode(
  qrProps: QRProps,
  options: DownloadOptions
): Promise<void> {
  const { format, size, filename } = options;

  // Validate size
  const validation = validateSize(size.width, size.height);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  // Create props with the custom size
  const propsWithSize = {
    ...qrProps,
    size: size.width, // QR codes are square, so we just use width
  };

  const defaultFilename = `qr-code-${size.width}x${size.height}.${getFileExtension(format)}`;
  const finalFilename = filename || defaultFilename;

  try {
    if (format === "svg") {
      // Download as SVG
      const svgDataUri = await getQRAsSVGDataUri(propsWithSize);
      downloadFile(svgDataUri, finalFilename);
    } else if (format === "pdf") {
      // Download as PDF
      const svgDataUri = await getQRAsSVGDataUri(propsWithSize);
      const svgString = decodeURIComponent(
        svgDataUri.replace("data:image/svg+xml,", "")
      );
      const pdfBlob = await svgToPdf(svgString, size.width, size.height);
      const pdfUrl = URL.createObjectURL(pdfBlob);
      downloadFile(pdfUrl, finalFilename);
      URL.revokeObjectURL(pdfUrl);
    } else if (format === "eps") {
      // Download as EPS
      const svgDataUri = await getQRAsSVGDataUri(propsWithSize);
      const svgString = decodeURIComponent(
        svgDataUri.replace("data:image/svg+xml,", "")
      );
      const epsString = svgToEps(svgString, size.width, size.height);
      const epsBlob = new Blob([epsString], { type: getMimeType(format) });
      const epsUrl = URL.createObjectURL(epsBlob);
      downloadFile(epsUrl, finalFilename);
      URL.revokeObjectURL(epsUrl);
    } else if (format === "png" || format === "jpg") {
      // Download as PNG or JPG
      const mimeType = getMimeType(format);
      const dataUrl = await getQRAsCanvas(propsWithSize, mimeType);
      if (typeof dataUrl === "string") {
        downloadFile(dataUrl, finalFilename);
      } else {
        throw new Error("Failed to generate image data URL");
      }
    } else {
      throw new Error("Unsupported download format");
    }
  } catch (error) {
    console.error(`Error downloading ${format.toUpperCase()}:`, error);
    throw error;
  }
}

/**
 * Gets a QR code as a data URL for preview or other purposes
 */
export async function getQRCodeDataUrl(
  qrProps: QRProps,
  format: DownloadFormat,
  size: DownloadSize
): Promise<string> {
  // Validate size
  const validation = validateSize(size.width, size.height);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  // Create props with the custom size
  const propsWithSize = {
    ...qrProps,
    size: size.width,
  };

  if (format === "svg") {
    return await getQRAsSVGDataUri(propsWithSize);
  }

  const mimeType = getMimeType(format);
  const result = await getQRAsCanvas(propsWithSize, mimeType);

  if (typeof result === "string") {
    return result;
  }

  throw new Error("Failed to generate QR code data URL");
}

/**
 * Copies QR code to clipboard (works best with PNG format)
 */
export async function copyQRCodeToClipboard(
  qrProps: QRProps,
  size: DownloadSize = { width: DEFAULT_SIZE, height: DEFAULT_SIZE }
): Promise<void> {
  try {
    // Validate size
    const validation = validateSize(size.width, size.height);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const propsWithSize = {
      ...qrProps,
      size: size.width,
    };

    // Get canvas
    const canvas = (await getQRAsCanvas(
      propsWithSize,
      "image/png",
      true
    )) as HTMLCanvasElement;

    // Convert canvas to blob
    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((canvasBlob) => {
        if (canvasBlob) {
          resolve(canvasBlob);
        } else {
          reject(new Error("Failed to create blob from canvas"));
        }
      }, "image/png");
    });

    // Copy to clipboard
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": imageBlob,
      }),
    ]);

    canvas.remove();
  } catch (error) {
    console.error("Error copying to clipboard:", error);
    throw error;
  }
}

/**
 * Gets SVG content as string (useful for copying SVG code)
 */
export async function getSVGString(qrProps: QRProps): Promise<string> {
  const svgDataUri = await getQRAsSVGDataUri(qrProps);
  return decodeURIComponent(svgDataUri.replace("data:image/svg+xml,", ""));
}
