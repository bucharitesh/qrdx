/** biome-ignore-all lint/complexity/noForEach: <explanation> */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  getQRAsCanvas,
  getQRAsSVGDataUri,
  getQRData,
  QRCode,
  QRCodeCanvas,
  QRCodeSVG,
} from "../../src/index";

describe("QR Code Generation Integration", () => {
  describe("End-to-end QR generation with QRCode component", () => {
    it("should generate complete QR code with all props", () => {
      const { container } = render(
        <QRCode
          bgColor="#ffffff"
          bodyPattern="circle"
          cornerEyeDotPattern="circle"
          cornerEyePattern="gear"
          dotColor="#00ff00"
          errorLevel="Q"
          eyeColor="#ff0000"
          fgColor="#000000"
          margin={4}
          scale={2}
          url="https://example.com"
        />
      );

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();

      // Check that styles include custom colors
      const style = container.querySelector("style");
      expect(style?.textContent).toContain("#000000");
      expect(style?.textContent).toContain("#ffffff");
      expect(style?.textContent).toContain("#ff0000");
      expect(style?.textContent).toContain("#00ff00");
    });

    it("should generate QR code with template", () => {
      const { container } = render(
        <QRCode
          customText="Test"
          templateId="FlamQR"
          url="https://example.com"
        />
      );

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("should generate QR code with logo", () => {
      const { container } = render(
        <QRCode
          hideLogo={false}
          logo="https://example.com/logo.png"
          url="https://example.com"
        />
      );

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("should generate QR code without logo", () => {
      const { container } = render(
        <QRCode hideLogo={true} url="https://example.com" />
      );

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("Canvas to SVG conversion", () => {
    it("should render both Canvas and SVG variants", () => {
      const canvasResult = render(<QRCodeCanvas value="test" />);
      const svgResult = render(<QRCodeSVG value="test" />);

      const canvas = canvasResult.container.querySelector("canvas");
      const svg = svgResult.container.querySelector("svg");

      expect(canvas).toBeInTheDocument();
      expect(svg).toBeInTheDocument();
    });

    it("should apply same props to both variants", () => {
      const props = {
        value: "test",
        size: 300,
        level: "Q" as const,
        bgColor: "#ffffff",
        fgColor: "#000000",
        margin: 4,
      };

      const canvasResult = render(<QRCodeCanvas {...props} />);
      const svgResult = render(<QRCodeSVG {...props} />);

      const canvas = canvasResult.container.querySelector("canvas");
      const svg = svgResult.container.querySelector("svg");

      expect(canvas).toBeInTheDocument();
      expect(svg).toBeInTheDocument();
      expect(svg?.getAttribute("width")).toBe("300");
    });
  });

  describe("Export functionality", () => {
    it("should export QR as SVG data URI", async () => {
      const dataUri = await getQRAsSVGDataUri({
        value: "test",
        size: 300,
      });

      expect(dataUri).toBeTruthy();
      expect(dataUri).toContain("data:image/svg+xml");
      expect(dataUri).toContain("svg");
    });

    it("should export QR with template as SVG data URI", async () => {
      const dataUri = await getQRAsSVGDataUri({
        value: "test",
        size: 300,
        templateId: "default",
      });

      expect(dataUri).toBeTruthy();
      expect(dataUri).toContain("data:image/svg+xml");
    });

    it("should export QR with custom colors", async () => {
      const dataUri = await getQRAsSVGDataUri({
        value: "test",
        bgColor: "#ff0000",
        fgColor: "#00ff00",
      });

      expect(dataUri).toBeTruthy();
      expect(dataUri).toContain("data:image/svg+xml");
      // Decode and check colors are in the SVG
      const svgString = decodeURIComponent(
        dataUri.replace("data:image/svg+xml,", "")
      );
      expect(svgString).toContain("#ff0000");
      expect(svgString).toContain("#00ff00");
    });

    it("should export QR as canvas", async () => {
      const result = await getQRAsCanvas(
        {
          value: "test",
          size: 300,
        },
        "image/png"
      );

      expect(result).toBeTruthy();
      if (typeof result === "string") {
        expect(result).toContain("data:image/png");
      } else {
        expect(result).toBeInstanceOf(HTMLCanvasElement);
      }
    });

    it("should export QR as JPEG", async () => {
      const result = await getQRAsCanvas(
        {
          value: "test",
          size: 300,
        },
        "image/jpeg"
      );

      expect(result).toBeTruthy();
      // In test environment with mocks, it may return mock data
      if (typeof result === "string") {
        expect(result).toContain("data:image/");
      }
    });

    it("should return canvas element when getCanvas is true", async () => {
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
  });

  describe("Complete workflow", () => {
    it("should generate QR data, render component, and export", async () => {
      // Step 1: Generate QR data
      const qrData = getQRData({
        url: "https://example.com",
        fgColor: "#000000",
        bgColor: "#ffffff",
      });

      expect(qrData.value).toBe("https://example.com?qr=1");
      expect(qrData.fgColor).toBe("#000000");
      expect(qrData.bgColor).toBe("#ffffff");

      // Step 2: Render component
      const { container } = render(
        <QRCodeSVG
          bgColor={qrData.bgColor}
          fgColor={qrData.fgColor}
          value={qrData.value}
        />
      );

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();

      // Step 3: Export as data URI
      const dataUri = await getQRAsSVGDataUri({
        value: qrData.value,
        fgColor: qrData.fgColor,
        bgColor: qrData.bgColor,
      });

      expect(dataUri).toBeTruthy();
      expect(dataUri).toContain("data:image/svg+xml");
    });

    it("should work with all templates", async () => {
      const templates = [
        "default",
        "FlamQR",
        "Arrow",
        "StandardBox",
        "SquareBorder",
        "StrikedBox",
        "Halloween",
      ];

      for (const templateId of templates) {
        const { container } = render(
          <QRCode templateId={templateId} url="https://example.com" />
        );

        const svg = container.querySelector("svg");
        expect(svg).toBeInTheDocument();

        // Also test export
        const dataUri = await getQRAsSVGDataUri({
          value: "test",
          templateId,
        });
        expect(dataUri).toBeTruthy();
      }
    });

    it("should work with all body patterns", () => {
      const patterns = [
        "circle",
        "square",
        "diamond",
        "circle-mixed",
        "pacman",
        "rounded",
        "clean-square",
      ] as const;

      patterns.forEach((pattern) => {
        const { container } = render(
          <QRCode bodyPattern={pattern} url="https://example.com" />
        );

        const svg = container.querySelector("svg");
        expect(svg).toBeInTheDocument();
      });
    });

    it("should work with all error levels", () => {
      const levels = ["L", "M", "Q", "H"] as const;

      levels.forEach((level) => {
        const { container } = render(
          <QRCode errorLevel={level} url="https://example.com" />
        );

        const svg = container.querySelector("svg");
        expect(svg).toBeInTheDocument();
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle very long URLs", () => {
      const longUrl = `https://example.com/${"a".repeat(1000)}`;
      const { container } = render(<QRCode url={longUrl} />);

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("should handle special characters in URL", () => {
      const specialUrl = "https://example.com/?param=value&other=test#hash";
      const { container } = render(<QRCode url={specialUrl} />);

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("should handle very small size", () => {
      const { container } = render(<QRCodeSVG size={50} value="test" />);

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg?.getAttribute("width")).toBe("50");
    });

    it("should handle very large size", () => {
      const { container } = render(<QRCodeSVG size={2000} value="test" />);

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg?.getAttribute("width")).toBe("2000");
    });

    it("should handle zero margin", () => {
      const { container } = render(<QRCodeSVG margin={0} value="test" />);

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("should handle large margin", () => {
      const { container } = render(<QRCodeSVG margin={20} value="test" />);

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });
});
