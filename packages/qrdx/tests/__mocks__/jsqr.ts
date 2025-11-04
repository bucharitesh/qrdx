import { vi } from "vitest";

export type QRCode = {
  binaryData: number[];
  data: string;
  chunks: any[];
  version: number;
  location: {
    topRightCorner: { x: number; y: number };
    topLeftCorner: { x: number; y: number };
    bottomRightCorner: { x: number; y: number };
    bottomLeftCorner: { x: number; y: number };
    topRightFinderPattern: { x: number; y: number };
    topLeftFinderPattern: { x: number; y: number };
    bottomLeftFinderPattern: { x: number; y: number };
    bottomRightAlignmentPattern?: { x: number; y: number };
  };
};

// Mock jsQR implementation
export const mockJsQR = vi.fn(
  (
    _data: Uint8ClampedArray,
    _width: number,
    _height: number
  ): QRCode | null => {
    // Default mock returns a valid QR code
    return {
      binaryData: [],
      data: "https://example.com?qr=1",
      chunks: [],
      version: 1,
      location: {
        topRightCorner: { x: 100, y: 0 },
        topLeftCorner: { x: 0, y: 0 },
        bottomRightCorner: { x: 100, y: 100 },
        bottomLeftCorner: { x: 0, y: 100 },
        topRightFinderPattern: { x: 90, y: 10 },
        topLeftFinderPattern: { x: 10, y: 10 },
        bottomLeftFinderPattern: { x: 10, y: 90 },
      },
    };
  }
);

export default mockJsQR;
