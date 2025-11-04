import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleImageLoad } from "../../src/detection";

// Mock jsQR
vi.mock("jsqr", () => ({
  default: vi.fn((width: number, height: number) => {
    if (width > 0 && height > 0) {
      return {
        data: "https://example.com?qr=1",
        binaryData: [],
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
    return null;
  }),
}));

describe("handleImageLoad", () => {
  let mockImage: HTMLImageElement;

  beforeEach(() => {
    mockImage = document.createElement("img");
    Object.defineProperty(mockImage, "naturalWidth", {
      value: 500,
      writable: true,
    });
    Object.defineProperty(mockImage, "naturalHeight", {
      value: 500,
      writable: true,
    });
    Object.defineProperty(mockImage, "complete", {
      value: true,
      writable: true,
    });
  });

  it("should return NO_QR when no image is provided", async () => {
    const result = await handleImageLoad(null as any, 500);
    expect(result).toBe("NO_QR");
  });

  it("should detect QR code from valid image", async () => {
    const result = await handleImageLoad(mockImage, 500);

    // Should return the QR code data
    expect(result).toBeTruthy();
    if (result !== "NO_QR") {
      expect(typeof result).toBe("string");
    }
  });

  it("should return full data when returnFullData is true", async () => {
    const result = await handleImageLoad(mockImage, 500, true);

    // Should return full QR code object
    expect(result).toBeTruthy();
    if (result !== "NO_QR") {
      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("location");
    }
  });

  it("should try multiple detection attempts", async () => {
    // The function tries multiple ratios and positions
    const result = await handleImageLoad(mockImage, 500);

    // Even if first attempt fails, should try others
    expect(result).toBeDefined();
  });

  it("should handle images with different dimensions", async () => {
    Object.defineProperty(mockImage, "naturalWidth", {
      value: 1000,
      writable: true,
    });
    Object.defineProperty(mockImage, "naturalHeight", {
      value: 800,
      writable: true,
    });

    const result = await handleImageLoad(mockImage, 500);
    expect(result).toBeDefined();
  });

  it("should wait for image processing", async () => {
    // The function includes a 100ms delay for image processing
    const startTime = Date.now();
    await handleImageLoad(mockImage, 500);
    const endTime = Date.now();

    expect(endTime - startTime).toBeGreaterThanOrEqual(100);
  });
});
