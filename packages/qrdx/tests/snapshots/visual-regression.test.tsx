/** biome-ignore-all lint/complexity/noForEach: <explanation> */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QRCode, QRCodeSVG } from "../../src/index";

describe("Visual Regression Snapshots", () => {
  describe("Basic QR Code Snapshots", () => {
    it("should match snapshot for basic QR code", () => {
      const { container } = render(<QRCodeSVG value="https://example.com" />);
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with custom size", () => {
      const { container } = render(
        <QRCodeSVG size={500} value="https://example.com" />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with custom colors", () => {
      const { container } = render(
        <QRCodeSVG
          bgColor="#ffffff"
          fgColor="#000000"
          value="https://example.com"
        />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with margin", () => {
      const { container } = render(
        <QRCodeSVG margin={8} value="https://example.com" />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with different error levels", () => {
      const levels = ["L", "M", "Q", "H"] as const;
      levels.forEach((level) => {
        const { container } = render(
          <QRCodeSVG level={level} value="https://example.com" />
        );
        expect(container.innerHTML).toMatchSnapshot(`error-level-${level}`);
      });
    });
  });

  describe("Body Pattern Snapshots", () => {
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
      it(`should match snapshot for ${pattern} pattern`, () => {
        const { container } = render(
          <QRCodeSVG bodyPattern={pattern} value="https://example.com" />
        );
        expect(container.innerHTML).toMatchSnapshot(`body-pattern-${pattern}`);
      });
    });
  });

  describe("Corner Pattern Snapshots", () => {
    it("should match snapshot with gear corner pattern", () => {
      const { container } = render(
        <QRCodeSVG
          cornerEyeDotPattern="circle"
          cornerEyePattern="gear"
          value="https://example.com"
        />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with different corner patterns", () => {
      const { container } = render(
        <QRCodeSVG
          cornerEyeDotPattern="square"
          cornerEyePattern="rounded-square"
          value="https://example.com"
        />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });
  });

  describe("Color Combination Snapshots", () => {
    it("should match snapshot with custom eye color", () => {
      const { container } = render(
        <QRCodeSVG
          eyeColor="#ff0000"
          fgColor="#000000"
          value="https://example.com"
        />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with custom dot color", () => {
      const { container } = render(
        <QRCodeSVG
          dotColor="#0000ff"
          fgColor="#000000"
          value="https://example.com"
        />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with all custom colors", () => {
      const { container } = render(
        <QRCodeSVG
          bgColor="#f0f0f0"
          dotColor="#0000ff"
          eyeColor="#ff0000"
          fgColor="#333333"
          value="https://example.com"
        />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });
  });

  describe("Template Snapshots", () => {
    const templates = [
      "default",
      "FlamQR",
      "Arrow",
      "StandardBox",
      "SquareBorder",
      "StrikedBox",
      "Halloween",
    ];

    templates.forEach((templateId) => {
      it(`should match snapshot for ${templateId} template`, () => {
        const { container } = render(
          <QRCode templateId={templateId} url="https://example.com" />
        );
        expect(container.innerHTML).toMatchSnapshot(`template-${templateId}`);
      });
    });
  });

  describe("Template with Custom Text Snapshots", () => {
    it("should match snapshot with custom text", () => {
      const { container } = render(
        <QRCode
          customText="Scan Me"
          templateId="FlamQR"
          url="https://example.com"
        />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with long custom text", () => {
      const { container } = render(
        <QRCode
          customText="This is a very long custom text"
          templateId="StandardBox"
          url="https://example.com"
        />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });
  });

  describe("Complex Configuration Snapshots", () => {
    it("should match snapshot with complex configuration", () => {
      const { container } = render(
        <QRCode
          bgColor="#f5f5f5"
          bodyPattern="circle"
          cornerEyeDotPattern="circle"
          cornerEyePattern="gear"
          dotColor="#4ecdc4"
          errorLevel="Q"
          eyeColor="#ff6b6b"
          fgColor="#1a1a1a"
          margin={4}
          url="https://example.com"
        />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with template and patterns", () => {
      const { container } = render(
        <QRCode
          bodyPattern="diamond"
          cornerEyeDotPattern="square"
          cornerEyePattern="gear"
          customText="Custom QR"
          templateId="FlamQR"
          url="https://example.com"
        />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });
  });

  describe("Edge Case Snapshots", () => {
    it("should match snapshot with minimal configuration", () => {
      const { container } = render(
        <QRCodeSVG margin={0} size={100} value="test" />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with maximum margin", () => {
      const { container } = render(<QRCodeSVG margin={20} value="test" />);
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with small size", () => {
      const { container } = render(<QRCodeSVG size={50} value="test" />);
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with large size", () => {
      const { container } = render(<QRCodeSVG size={1000} value="test" />);
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with long URL", () => {
      const longUrl = `https://example.com/${"a".repeat(500)}`;
      const { container } = render(<QRCodeSVG value={longUrl} />);
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with special characters", () => {
      const specialUrl =
        "https://example.com/?param=value&other=test&special=!@#$%^&*()";
      const { container } = render(<QRCodeSVG value={specialUrl} />);
      expect(container.innerHTML).toMatchSnapshot();
    });
  });

  describe("QRCode Wrapper Snapshots", () => {
    it("should match snapshot for QRCode wrapper", () => {
      const { container } = render(<QRCode url="https://example.com" />);
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot with scale", () => {
      const { container } = render(
        <QRCode scale={2} url="https://example.com" />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });

    it("should match snapshot without logo", () => {
      const { container } = render(
        <QRCode hideLogo={true} url="https://example.com" />
      );
      expect(container.innerHTML).toMatchSnapshot();
    });
  });
});
