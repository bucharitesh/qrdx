import type { QRProps } from "../types";
import { DEFAULT_SIZE } from "./constants";
import { getQRAsCanvas, getQRAsSVGDataUri } from "./index";

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
  return format;
}

/**
 * Convert QR code to PDF format
 */
async function getQRAsPDF(qrProps: QRProps): Promise<string> {
  const { jsPDF } = await import("jspdf");

  // Get the SVG as a data URI
  const svgDataUri = await getQRAsSVGDataUri(qrProps);
  const svgString = decodeURIComponent(
    svgDataUri.replace("data:image/svg+xml,", "")
  );

  // Convert SVG to base64 for better compatibility
  const base64SVG = btoa(unescape(encodeURIComponent(svgString)));
  const base64DataUri = `data:image/svg+xml;base64,${base64SVG}`;

  // Get canvas from SVG using base64 encoding (more reliable than URL encoding)
  const canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
    const img = new Image();
    const tempCanvas = document.createElement("canvas");
    const size = qrProps.size || DEFAULT_SIZE;

    tempCanvas.width = size;
    tempCanvas.height = size;

    const ctx = tempCanvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }

    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0);
        resolve(tempCanvas);
      } catch (error) {
        reject(new Error(`Failed to draw image to canvas: ${error}`));
      }
    };

    img.onerror = (error) => {
      console.error("Image load error:", error);
      console.error("SVG string length:", svgString.length);
      reject(new Error("Could not load SVG - image may contain invalid data"));
    };

    // Use base64-encoded data URI for maximum compatibility
    img.src = base64DataUri;
  });

  // Create PDF with the canvas
  const imgData = canvas.toDataURL("image/png", 1.0);
  const size = qrProps.size || DEFAULT_SIZE;
  const mmSize = size * 0.264_583; // Convert pixels to mm (assuming 96 DPI)

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [mmSize, mmSize],
  });

  pdf.addImage(imgData, "PNG", 0, 0, mmSize, mmSize);

  canvas.remove();

  // Return as data URL
  return pdf.output("dataurlstring");
}

/**
 * Convert SVG to EPS format
 */
async function getQRAsEPS(qrProps: QRProps): Promise<string> {
  // Get the SVG string
  const svgDataUri = await getQRAsSVGDataUri(qrProps);
  const svgString = decodeURIComponent(
    svgDataUri.replace("data:image/svg+xml,", "")
  );

  // Parse SVG to extract paths and basic shapes
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
  const svgElement = svgDoc.documentElement;

  const size = qrProps.size || DEFAULT_SIZE;
  const width = size;
  const height = size;

  // Create EPS header
  let eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${width} ${height}
%%HiResBoundingBox: 0.000000 0.000000 ${width}.000000 ${height}.000000
%%Creator: QRDX
%%Title: QR Code
%%CreationDate: ${new Date().toISOString()}
%%DocumentData: Clean7Bit
%%Origin: 0 0
%%LanguageLevel: 2
%%Pages: 1
%%Page: 1 1
`;

  // Add PostScript commands to draw the QR code
  eps += `
/size ${size} def
/scale size def

% Set coordinate system
0 ${height} translate
1 -1 scale

% Define colors from background
`;

  // Extract background color from SVG
  const bgRect = svgElement.querySelector("rect");
  let bgColor = "#ffffff";
  if (bgRect) {
    bgColor = bgRect.getAttribute("fill") || "#ffffff";
  }

  // Convert hex to RGB for EPS
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: Number.parseInt(result[1], 16) / 255,
          g: Number.parseInt(result[2], 16) / 255,
          b: Number.parseInt(result[3], 16) / 255,
        }
      : { r: 1, g: 1, b: 1 };
  };

  const bg = hexToRgb(bgColor);
  eps += `${bg.r} ${bg.g} ${bg.b} setrgbcolor\n`;
  eps += `0 0 ${width} ${height} rectfill\n\n`;

  // Get all paths from SVG
  const paths = svgElement.querySelectorAll("path");

  if (paths.length > 0) {
    // Extract foreground color
    const firstPath = paths[0];
    let fgColor = "#000000";
    if (firstPath) {
      fgColor = firstPath.getAttribute("fill") || "#000000";
    }

    const fg = hexToRgb(fgColor);
    eps += `${fg.r} ${fg.g} ${fg.b} setrgbcolor\n\n`;

    // Convert SVG paths to PostScript paths
    for (const path of paths) {
      const d = path.getAttribute("d");
      if (d) {
        // Simple path conversion - this handles basic rect commands
        const commands = d.match(
          /[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g
        );
        if (commands) {
          eps += "newpath\n";
          let currentX = 0;
          let currentY = 0;

          for (const cmd of commands) {
            const type = cmd[0];
            const coords = cmd
              .slice(1)
              .trim()
              .split(/[\s,]+/)
              .map((n) => Number.parseFloat(n));

            switch (type) {
              case "M": // Move to absolute
                currentX = coords[0];
                currentY = coords[1];
                eps += `${currentX} ${currentY} moveto\n`;
                break;
              case "L": // Line to absolute
                currentX = coords[0];
                currentY = coords[1];
                eps += `${currentX} ${currentY} lineto\n`;
                break;
              case "H": // Horizontal line absolute
                currentX = coords[0];
                eps += `${currentX} ${currentY} lineto\n`;
                break;
              case "V": // Vertical line absolute
                currentY = coords[0];
                eps += `${currentX} ${currentY} lineto\n`;
                break;
              case "Z": // Close path
              case "z":
                eps += "closepath\n";
                break;
              default:
                // Ignore unsupported path commands
                break;
            }
          }
          eps += "fill\n";
        }
      }
    }
  } else {
    // Fallback: draw rectangles for each QR module
    const rects = svgElement.querySelectorAll("rect:not(:first-child)");
    let fgColor = "#000000";
    if (rects[0]) {
      fgColor = rects[0].getAttribute("fill") || "#000000";
    }

    const fg = hexToRgb(fgColor);
    eps += `${fg.r} ${fg.g} ${fg.b} setrgbcolor\n\n`;

    for (const rect of rects) {
      const x = Number.parseFloat(rect.getAttribute("x") || "0");
      const y = Number.parseFloat(rect.getAttribute("y") || "0");
      const w = Number.parseFloat(rect.getAttribute("width") || "0");
      const h = Number.parseFloat(rect.getAttribute("height") || "0");

      eps += "newpath\n";
      eps += `${x} ${y} moveto\n`;
      eps += `${x + w} ${y} lineto\n`;
      eps += `${x + w} ${y + h} lineto\n`;
      eps += `${x} ${y + h} lineto\n`;
      eps += "closepath\nfill\n";
    }
  }

  eps += "\nshowpage\n%%EOF\n";

  // Convert to data URL
  const epsBlob = new Blob([eps], { type: "application/postscript" });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert EPS to data URL"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read EPS blob"));
    reader.readAsDataURL(epsBlob);
  });
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
      const pdfDataUrl = await getQRAsPDF(propsWithSize);
      downloadFile(pdfDataUrl, finalFilename);
    } else if (format === "eps") {
      // Download as EPS
      const epsDataUrl = await getQRAsEPS(propsWithSize);
      downloadFile(epsDataUrl, finalFilename);
    } else {
      // Download as PNG or JPG
      const mimeType = getMimeType(format);
      const dataUrl = await getQRAsCanvas(propsWithSize, mimeType);
      if (typeof dataUrl === "string") {
        downloadFile(dataUrl, finalFilename);
      } else {
        throw new Error("Failed to generate image data URL");
      }
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

  if (format === "pdf") {
    return await getQRAsPDF(propsWithSize);
  }

  if (format === "eps") {
    return await getQRAsEPS(propsWithSize);
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
