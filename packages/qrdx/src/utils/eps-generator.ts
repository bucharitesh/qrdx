/**
 * EPS (Encapsulated PostScript) Generator for QR Codes
 *
 * Generates print-ready EPS files from QR code matrices.
 * Uses CMYK color space for optimal print quality.
 */

export interface CMYKColor {
  c: number;
  m: number;
  y: number;
  k: number;
}

/**
 * Parse hex color string to RGB values (0-255)
 * Supports both #RGB and #RRGGBB formats
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, "");

  let r: number, g: number, b: number;

  if (cleanHex.length === 3) {
    // Short format: #RGB -> #RRGGBB
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  } else {
    // Fallback to black for invalid input
    return { r: 0, g: 0, b: 0 };
  }

  return { r, g, b };
}

/**
 * Convert RGB (0-255) to CMYK (0-1 range)
 * Uses standard RGB to CMYK conversion formula
 */
function rgbToCmyk(r: number, g: number, b: number): CMYKColor {
  // Normalize RGB to 0-1 range
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  // Calculate K (black key)
  const k = 1 - Math.max(rNorm, gNorm, bNorm);

  // Handle pure black case to avoid division by zero
  if (k === 1) {
    return { c: 0, m: 0, y: 0, k: 1 };
  }

  // Calculate CMY values
  const c = (1 - rNorm - k) / (1 - k);
  const m = (1 - gNorm - k) / (1 - k);
  const y = (1 - bNorm - k) / (1 - k);

  return { c, m, y, k };
}

/**
 * Convert hex color to CMYK (0-1 range)
 */
function hexToCmyk(hex: string): CMYKColor {
  const { r, g, b } = hexToRgb(hex);
  return rgbToCmyk(r, g, b);
}

/**
 * Generate PostScript setcmykcolor command
 */
function cmykColorCommand(color: CMYKColor): string {
  // Round to 4 decimal places for clean output
  const c = color.c.toFixed(4);
  const m = color.m.toFixed(4);
  const y = color.y.toFixed(4);
  const k = color.k.toFixed(4);
  return `${c} ${m} ${y} ${k} setcmykcolor`;
}

export interface GenerateEPSOptions {
  /** The QR code matrix (2D array where truthy = dark module) */
  matrix: unknown[][];
  /** Output size in points (1 point = 1/72 inch) */
  size: number;
  /** Hex color for QR modules (e.g., "#000000") */
  color: string;
  /** Hex color for background (e.g., "#FFFFFF") */
  backgroundColor: string;
}

/**
 * Generate an EPS (Encapsulated PostScript) string from a QR code matrix
 *
 * @param options - Generation options
 * @returns Complete EPS file content as a string
 *
 * @example
 * ```ts
 * const eps = generateEPS({
 *   matrix: qrMatrix,
 *   size: 300,
 *   color: "#000000",
 *   backgroundColor: "#FFFFFF"
 * });
 * ```
 */
export function generateEPS(options: GenerateEPSOptions): string {
  const { matrix, size, color, backgroundColor } = options;

  const rows = matrix.length;
  if (rows === 0) {
    throw new Error("Matrix cannot be empty");
  }

  const blockSize = size / rows;
  const lines: string[] = [];

  // EPS Header
  lines.push("%!PS-Adobe-3.0 EPSF-3.0");
  lines.push(`%%BoundingBox: 0 0 ${size} ${size}`);
  lines.push("%%HiResBoundingBox: 0 0 " + size.toFixed(4) + " " + size.toFixed(4));
  lines.push("%%Creator: qrdx EPS Generator");
  lines.push("%%LanguageLevel: 2");
  lines.push("%%Pages: 1");
  lines.push("%%EndComments");
  lines.push("");

  // Define rectfill procedure for efficiency
  lines.push("% Define rectangle fill procedure: x y w h rf");
  lines.push("/rf { rectfill } bind def");
  lines.push("");

  // Draw background
  const bgCmyk = hexToCmyk(backgroundColor);
  lines.push("% Background");
  lines.push(cmykColorCommand(bgCmyk));
  lines.push(`0 0 ${size} ${size} rf`);
  lines.push("");

  // Set foreground color for QR modules
  const fgCmyk = hexToCmyk(color);
  lines.push("% QR Code Modules");
  lines.push(cmykColorCommand(fgCmyk));

  // Iterate through matrix and draw active modules
  // PostScript Y-axis starts at bottom-left, matrix starts at top-left
  for (let row = 0; row < rows; row++) {
    const matrixRow = matrix[row];
    if (!matrixRow) continue;

    const cols = matrixRow.length;

    for (let col = 0; col < cols; col++) {
      const cell = matrixRow[col];

      // Check if module is active (truthy value: true, 1, etc.)
      if (cell) {
        // Calculate X position (left to right, same as matrix)
        const x = col * blockSize;

        // Calculate Y position (flip Y-axis: bottom-left origin)
        // For row 0 (top of matrix), y should be at (size - blockSize)
        // For last row, y should be at 0
        const y = size - (row + 1) * blockSize;

        // Round to 4 decimal places for clean output
        lines.push(`${x.toFixed(4)} ${y.toFixed(4)} ${blockSize.toFixed(4)} ${blockSize.toFixed(4)} rf`);
      }
    }
  }

  lines.push("");
  lines.push("%%EOF");

  return lines.join("\n");
}
