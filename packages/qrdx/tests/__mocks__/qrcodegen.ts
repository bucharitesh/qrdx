import { vi } from "vitest";

// Simple mock QR code modules generator
const generateMockModules = (size: number): boolean[][] => {
  const modules: boolean[][] = [];
  for (let i = 0; i < size; i + 1) {
    const row: boolean[] = [];
    for (let j = 0; j < size; j + 1) {
      // Create a pattern that looks like a QR code
      // Corners (7x7 position detection patterns)
      const isTopLeft = i < 7 && j < 7;
      const isTopRight = i < 7 && j >= size - 7;
      const isBottomLeft = i >= size - 7 && j < 7;

      if (isTopLeft || isTopRight || isBottomLeft) {
        // Position detection pattern: outer square
        const inOuterSquare =
          i === 0 ||
          i === 6 ||
          j === 0 ||
          j === 6 ||
          (i >= size - 7 && (i === size - 7 || i === size - 1)) ||
          (j >= size - 7 && (j === size - 7 || j === size - 1));
        // Inner dot (3x3)
        const relI = i >= size - 7 ? i - (size - 7) : i;
        const relJ = j >= size - 7 ? j - (size - 7) : j;
        const inInnerDot = relI >= 2 && relI <= 4 && relJ >= 2 && relJ <= 4;

        row.push(inOuterSquare || inInnerDot);
      } else {
        // Random pattern for data modules
        row.push(Math.random() > 0.5);
      }
    }
    modules.push(row);
  }
  return modules;
};

export class QrCode {
  private readonly modules: boolean[][];

  constructor(_segments: any[], _minVersion?: number, _maxVersion?: number) {
    // Size varies based on version/error correction level
    const size = 25; // Version 1 QR code is 21x21, we'll use 25 for testing
    this.modules = generateMockModules(size);
  }

  getModules(): boolean[][] {
    return this.modules;
  }

  static encodeText = vi.fn(
    (text: string, errorCorrectionLevel: any): QrCode =>
      new QrCode([{ text }], errorCorrectionLevel)
  );

  static Ecc = {
    LOW: 0,
    MEDIUM: 1,
    QUARTILE: 2,
    HIGH: 3,
  };
}

export default {
  QrCode,
};
