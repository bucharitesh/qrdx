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

/** Pixel rendering style for QR modules */
export type PixelStyle = "square" | "dot" | "rounded";

/** Eye/Finder pattern rendering style */
export type EyeStyle = "square" | "circle";

/**
 * Parse hex color string to RGB values (0-255)
 * Supports #RGB, #RRGGBB, #RRGGBBAA, and variants without #
 */
function hexToRgb(
  hex: string,
  fallback: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }
): { r: number; g: number; b: number } {
  if (!hex || typeof hex !== "string") {
    console.warn(`[EPS Generator] Invalid hex color: "${hex}", using fallback`);
    return fallback;
  }

  let cleanHex = hex.trim().replace(/^#/, "");

  // Handle 8-digit hex (RGBA) - ignore alpha
  if (cleanHex.length === 8) cleanHex = cleanHex.substring(0, 6);
  // Handle 4-digit hex (RGBA short) - ignore alpha
  if (cleanHex.length === 4) cleanHex = cleanHex.substring(0, 3);

  if (!/^[0-9A-Fa-f]+$/.test(cleanHex)) {
    console.warn(`[EPS Generator] Invalid hex: "${hex}", using fallback`);
    return fallback;
  }

  let r: number, g: number, b: number;

  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  } else {
    return fallback;
  }

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return fallback;
  }

  return { r, g, b };
}

function rgbToCmyk(r: number, g: number, b: number): CMYKColor {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const k = 1 - Math.max(rNorm, gNorm, bNorm);

  if (k === 1) return { c: 0, m: 0, y: 0, k: 1 };

  return {
    c: (1 - rNorm - k) / (1 - k),
    m: (1 - gNorm - k) / (1 - k),
    y: (1 - bNorm - k) / (1 - k),
    k,
  };
}

function hexToCmyk(
  hex: string,
  fallbackRgb: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }
): CMYKColor {
  const { r, g, b } = hexToRgb(hex, fallbackRgb);
  return rgbToCmyk(r, g, b);
}

function cmykColorCommand(color: CMYKColor): string {
  return `${color.c.toFixed(4)} ${color.m.toFixed(4)} ${color.y.toFixed(4)} ${color.k.toFixed(4)} setcmykcolor`;
}

/**
 * Check if a cell is within a finder pattern (eye) zone
 * Finder patterns are 7x7 squares at three corners
 */
function isInFinderPattern(col: number, row: number, matrixSize: number): boolean {
  // Top-left (0-6, 0-6)
  if (col <= 6 && row <= 6) return true;
  // Top-right (matrixSize-7 to matrixSize-1, 0-6)
  if (col >= matrixSize - 7 && row <= 6) return true;
  // Bottom-left (0-6, matrixSize-7 to matrixSize-1)
  if (col <= 6 && row >= matrixSize - 7) return true;
  return false;
}

export interface GenerateEPSOptions {
  /** The QR code matrix (2D array where truthy = dark module) */
  matrix: unknown[][];
  /** Output size in points (1 point = 1/72 inch) */
  size: number;
  /** Hex color for QR body modules (e.g., "#000000") */
  color: string;
  /** Hex color for background (e.g., "#FFFFFF") */
  backgroundColor: string;
  /** Hex color for QR eyes/finder patterns (e.g., "#000000") */
  eyeColor?: string;
  /** Pixel rendering style: 'square' (default), 'dot', or 'rounded' */
  pixelStyle?: PixelStyle;
  /** Eye/Finder pattern style: 'square' (default) or 'circle' */
  eyePattern?: EyeStyle;
}

/**
 * Generate an EPS (Encapsulated PostScript) string from a QR code matrix
 */
export function generateEPS(options: GenerateEPSOptions): string {
  const {
    matrix,
    size,
    color,
    backgroundColor,
    eyeColor = color, // Default to body color if not specified
    pixelStyle = "square",
    eyePattern = "square",
  } = options;

  const rows = matrix.length;
  if (rows === 0) throw new Error("Matrix cannot be empty");

  const blockSize = size / rows;
  const lines: string[] = [];

  // EPS Header
  lines.push("%!PS-Adobe-3.0 EPSF-3.0");
  lines.push(`%%BoundingBox: 0 0 ${Math.round(size)} ${Math.round(size)}`);
  lines.push(`%%HiResBoundingBox: 0 0 ${size.toFixed(4)} ${size.toFixed(4)}`);
  lines.push("%%Creator: qrdx EPS Generator");
  lines.push("%%LanguageLevel: 2");
  lines.push("%%Pages: 1");
  lines.push("%%EndComments");
  lines.push("");

  // Define procedures
  lines.push("% Procedures");
  lines.push("/rf { rectfill } bind def");
  lines.push("/circ { newpath 0 360 arc fill } bind def");
  lines.push("/ring { newpath 0 360 arc stroke } bind def");
  lines.push("");

  // Colors
  const bgCmyk = hexToCmyk(backgroundColor, { r: 255, g: 255, b: 255 });
  const bodyCmyk = hexToCmyk(color, { r: 0, g: 0, b: 0 });
  const eyeCmyk = hexToCmyk(eyeColor, { r: 0, g: 0, b: 0 });

  // Draw background
  lines.push("% Background");
  lines.push(cmykColorCommand(bgCmyk));
  lines.push(`0 0 ${size} ${size} rf`);
  lines.push("");

  // ============================================
  // PHASE 1: Draw body modules (skip finder zones)
  // ============================================
  lines.push("% Body Modules");
  lines.push(cmykColorCommand(bodyCmyk));

  const useCircle = pixelStyle === "dot" || pixelStyle === "rounded";

  for (let row = 0; row < rows; row++) {
    const matrixRow = matrix[row];
    if (!matrixRow) continue;

    const cols = matrixRow.length;
    for (let col = 0; col < cols; col++) {
      // CRITICAL: Skip finder pattern zones
      if (isInFinderPattern(col, row, rows)) continue;

      const cell = matrixRow[col];
      if (cell) {
        const x = col * blockSize;
        const y = size - (row + 1) * blockSize;

        if (useCircle) {
          const radius = blockSize / 2;
          const cx = x + radius;
          const cy = y + radius;
          lines.push(`${cx.toFixed(4)} ${cy.toFixed(4)} ${radius.toFixed(4)} circ`);
        } else {
          lines.push(`${x.toFixed(4)} ${y.toFixed(4)} ${blockSize.toFixed(4)} ${blockSize.toFixed(4)} rf`);
        }
      }
    }
  }

  // ============================================
  // PHASE 2: Draw finder patterns (eyes)
  // ============================================
  lines.push("");
  lines.push("% Finder Patterns (Eyes)");
  lines.push(cmykColorCommand(eyeCmyk));

  // Eye positions: [startCol, startRow] of each 7x7 finder
  const eyePositions = [
    { startCol: 0, startRow: 0 },              // Top-left
    { startCol: rows - 7, startRow: 0 },       // Top-right
    { startCol: 0, startRow: rows - 7 },       // Bottom-left
  ];

  /**
   * Draw a finder pattern at the given grid position
   */
  function drawEye(startCol: number, startRow: number): void {
    // Center of 7x7 pattern in grid coordinates (3.5, 3.5 from corner)
    const centerGridX = startCol + 3.5;
    const centerGridY = startRow + 3.5;

    // Convert to EPS coordinates (flip Y)
    const cx = centerGridX * blockSize;
    const cy = size - centerGridY * blockSize;

    if (eyePattern === "circle") {
      // Outer ring: radius ~3 modules, stroke width 1 module
      const outerRadius = 3 * blockSize;
      const strokeWidth = blockSize;
      lines.push(`${strokeWidth.toFixed(4)} setlinewidth`);
      lines.push(`${cx.toFixed(4)} ${cy.toFixed(4)} ${outerRadius.toFixed(4)} ring`);

      // Inner dot: solid circle, radius ~1.5 modules
      const innerRadius = 1.5 * blockSize;
      lines.push(`${cx.toFixed(4)} ${cy.toFixed(4)} ${innerRadius.toFixed(4)} circ`);
    } else {
      // Square pattern: nested rectangles
      // Outer 7x7 box
      const outerX = startCol * blockSize;
      const outerY = size - (startRow + 7) * blockSize;
      const outerSize = 7 * blockSize;
      lines.push(`${outerX.toFixed(4)} ${outerY.toFixed(4)} ${outerSize.toFixed(4)} ${outerSize.toFixed(4)} rf`);

      // White 5x5 middle (creates ring effect)
      lines.push(cmykColorCommand(bgCmyk));
      const midX = (startCol + 1) * blockSize;
      const midY = size - (startRow + 6) * blockSize;
      const midSize = 5 * blockSize;
      lines.push(`${midX.toFixed(4)} ${midY.toFixed(4)} ${midSize.toFixed(4)} ${midSize.toFixed(4)} rf`);

      // Inner 3x3 box
      lines.push(cmykColorCommand(eyeCmyk));
      const innerX = (startCol + 2) * blockSize;
      const innerY = size - (startRow + 5) * blockSize;
      const innerSize = 3 * blockSize;
      lines.push(`${innerX.toFixed(4)} ${innerY.toFixed(4)} ${innerSize.toFixed(4)} ${innerSize.toFixed(4)} rf`);
    }
  }

  // Draw all 3 eyes
  for (const eye of eyePositions) {
    drawEye(eye.startCol, eye.startRow);
  }

  lines.push("");
  lines.push("%%EOF");

  return lines.join("\n");
}
