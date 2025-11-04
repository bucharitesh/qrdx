import type { QRProps } from "../types";
import { DEFAULT_SIZE } from "./constants";
import { getQRAsCanvas, getQRAsSVGDataUri } from "./index";

export type DownloadFormat = "png" | "jpg" | "svg";

export type DownloadSize = {
  width: number;
  height: number;
};

export const PRESET_SIZES: Record<string, DownloadSize> = {
  small: { width: 200, height: 200 },
  medium: { width: 400, height: 400 },
  large: { width: 800, height: 800 },
  xlarge: { width: 1200, height: 1200 },
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
