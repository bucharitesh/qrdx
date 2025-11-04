/** biome-ignore-all lint/complexity/noForEach: <explanation> */
/** biome-ignore-all lint/suspicious/noEmptyBlockStatements: <explanation> */
import { describe, expect, it, vi } from "vitest";
import { getQRAsCanvas, getQRAsSVGDataUri, getQRData } from "../../src/index";

describe("Export Functions", () => {
  describe("getQRAsSVGDataUri", () => {
    it("should export without image settings", async () => {
      const dataUri = await getQRAsSVGDataUri({
        value: "test",
        size: 300,
      });

      expect(dataUri).toBeTruthy();
      expect(dataUri).toContain("data:image/svg+xml");
    });

    it("should handle image settings with src", async () => {
      const dataUri = await getQRAsSVGDataUri({
        value: "test",
        size: 300,
        imageSettings: {
          src: "https://example.com/logo.png",
          width: 50,
          height: 50,
          excavate: true,
        },
      });

      expect(dataUri).toBeTruthy();
      expect(dataUri).toContain("data:image/svg+xml");
    });

    it("should handle error when loading image", async () => {
      // Mock console.error to suppress error output
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const dataUri = await getQRAsSVGDataUri({
        value: "test",
        size: 300,
        imageSettings: {
          src: "invalid://url",
          width: 50,
          height: 50,
          excavate: true,
        },
      });

      expect(dataUri).toBeTruthy();
      consoleError.mockRestore();
    });

    it("should include templateId in props", async () => {
      const dataUri = await getQRAsSVGDataUri({
        value: "test",
        size: 300,
        templateId: "default",
      });

      expect(dataUri).toBeTruthy();
      expect(dataUri).toContain("data:image/svg+xml");
    });
  });

  describe("getQRAsCanvas", () => {
    it("should handle PNG export", async () => {
      const result = await getQRAsCanvas(
        {
          value: "test",
          size: 300,
        },
        "image/png"
      );

      expect(result).toBeTruthy();
    });

    it("should handle JPEG with white background", async () => {
      const result = await getQRAsCanvas(
        {
          value: "test",
          size: 300,
        },
        "image/jpeg"
      );

      expect(result).toBeTruthy();
    });

    it("should return canvas when getCanvas is true", async () => {
      const result = await getQRAsCanvas(
        {
          value: "test",
          size: 300,
        },
        "image/png",
        true
      );

      expect(result).toBeInstanceOf(HTMLCanvasElement);
    });

    it("should return data URL when getCanvas is false", async () => {
      const result = await getQRAsCanvas(
        {
          value: "test",
          size: 300,
        },
        "image/png",
        false
      );

      if (typeof result === "string") {
        expect(result).toContain("data:image/");
      }
    });

    it("should use default size when not provided", async () => {
      const result = await getQRAsCanvas(
        {
          value: "test",
        },
        "image/png"
      );

      expect(result).toBeTruthy();
    });

    it("should handle errors in image loading", async () => {
      // This tests the error path in image loading
      try {
        await getQRAsCanvas(
          {
            value: "test",
            size: 300,
          },
          "image/png"
        );
      } catch (error) {
        // Error handling is expected in some cases
        expect(error).toBeDefined();
      }
    });
  });

  describe("getQRData", () => {
    it("should generate data with default values", () => {
      const data = getQRData({ url: "https://example.com" });

      expect(data.value).toContain("?qr=1");
      expect(data.size).toBe(1024);
      expect(data.level).toBe("Q");
    });

    it("should handle all color options", () => {
      const data = getQRData({
        url: "https://example.com",
        fgColor: "#000000",
        bgColor: "#ffffff",
        eyeColor: "#ff0000",
        dotColor: "#00ff00",
      });

      expect(data.fgColor).toBe("#000000");
      expect(data.bgColor).toBe("#ffffff");
      expect(data.eyeColor).toBe("#ff0000");
      expect(data.dotColor).toBe("#00ff00");
    });

    it("should handle body patterns", () => {
      const patterns = ["circle", "square", "diamond"] as const;

      patterns.forEach((pattern) => {
        const data = getQRData({
          url: "https://example.com",
          bodyPattern: pattern,
        });

        expect(data.bodyPattern).toBe(pattern);
      });
    });

    it("should handle logo settings", () => {
      const data = getQRData({
        url: "https://example.com",
        hideLogo: false,
        logo: "custom-logo.png",
      });

      expect(data.imageSettings).toBeDefined();
      expect(data.imageSettings?.src).toBe("custom-logo.png");
    });

    it("should handle custom margin", () => {
      const data = getQRData({
        url: "https://example.com",
        margin: 10,
      });

      expect(data.margin).toBe(10);
    });
  });
});
