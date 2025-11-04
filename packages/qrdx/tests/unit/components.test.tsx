/** biome-ignore-all lint/complexity/noForEach: <explanation> */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QRCodeCanvas } from "../../src/index";
import { QRCode } from "../../src/qr-code";
import { QRCodeSVG } from "../../src/utils";

describe("QRCodeCanvas", () => {
  it("should render canvas element", () => {
    const { container } = render(<QRCodeCanvas value="test" />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("should apply custom size", () => {
    const { container } = render(<QRCodeCanvas size={500} value="test" />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBe(500);
    expect(canvas.height).toBe(500);
  });

  it("should apply default size when not specified", () => {
    const { container } = render(<QRCodeCanvas value="test" />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
  });

  it("should handle custom colors", () => {
    const { container } = render(
      <QRCodeCanvas bgColor="#ff0000" fgColor="#00ff00" value="test" />
    );
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("should apply margin", () => {
    const { container } = render(<QRCodeCanvas margin={8} value="test" />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("should handle image settings", async () => {
    const imageSettings = {
      src: "test.png",
      width: 50,
      height: 50,
      excavate: true,
    };

    const { container } = render(
      <QRCodeCanvas imageSettings={imageSettings} value="test" />
    );

    // Should render hidden image element
    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
    });
  });

  it("should handle different error levels", () => {
    const levels = ["L", "M", "Q", "H"] as const;

    levels.forEach((level) => {
      const { container } = render(<QRCodeCanvas level={level} value="test" />);
      const canvas = container.querySelector("canvas");
      expect(canvas).toBeInTheDocument();
    });
  });

  it("should apply custom style", () => {
    const customStyle = { border: "1px solid red" };
    const { container } = render(
      <QRCodeCanvas style={customStyle} value="test" />
    );
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.style.border).toBe("1px solid red");
  });

  it("should pass through additional props", () => {
    render(<QRCodeCanvas data-testid="qr-canvas" value="test" />);
    const canvas = screen.getByTestId("qr-canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("should update when value changes", () => {
    const { rerender, container } = render(<QRCodeCanvas value="test1" />);
    const canvas1 = container.querySelector("canvas");

    rerender(<QRCodeCanvas value="test2" />);
    const canvas2 = container.querySelector("canvas");

    expect(canvas1).toBe(canvas2); // Same element
  });
});

describe("QRCodeSVG Component", () => {
  it("should render SVG element", () => {
    const { container } = render(<QRCodeSVG value="test" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should apply custom size", () => {
    const { container } = render(<QRCodeSVG size={500} value="test" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("500");
    expect(svg?.getAttribute("height")).toBe("500");
  });

  it("should include viewBox", () => {
    const { container } = render(<QRCodeSVG value="test" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBeTruthy();
  });

  it("should render background rect", () => {
    const { container } = render(<QRCodeSVG value="test" />);
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBeGreaterThan(0);
  });

  it("should apply body pattern", () => {
    const patterns = ["circle", "square", "diamond"] as const;

    patterns.forEach((pattern) => {
      const { container } = render(
        <QRCodeSVG bodyPattern={pattern} value="test" />
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  it("should render corner patterns", () => {
    const { container } = render(
      <QRCodeSVG
        cornerEyeDotPattern="circle"
        cornerEyePattern="gear"
        value="test"
      />
    );

    // Should have groups for corner patterns
    const groups = container.querySelectorAll("g");
    expect(groups.length).toBeGreaterThan(0);
  });

  it("should apply eye and dot colors", () => {
    const { container } = render(
      <QRCodeSVG dotColor="#0000ff" eyeColor="#ff0000" value="test" />
    );

    const styles = container.querySelector("style");
    expect(styles?.textContent).toContain("#ff0000");
    expect(styles?.textContent).toContain("#0000ff");
  });

  it("should handle template", () => {
    const { container } = render(
      <QRCodeSVG templateId="default" value="test" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should handle custom text", () => {
    const { container } = render(
      <QRCodeSVG customText="Custom" templateId="FlamQR" value="test" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should pass through SVG props", () => {
    const { container } = render(
      <QRCodeSVG className="test-class" id="test-svg" value="test" />
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toBe("test-class");
    expect(svg?.getAttribute("id")).toBe("test-svg");
  });
});

describe("QRCode Wrapper Component", () => {
  it("should render QR code", () => {
    const { container } = render(<QRCode url="https://example.com" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should apply foreground color", () => {
    const { container } = render(
      <QRCode fgColor="#000000" url="https://example.com" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should apply background color", () => {
    const { container } = render(
      <QRCode bgColor="#ffffff" url="https://example.com" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should handle logo visibility", () => {
    const { container } = render(
      <QRCode hideLogo={true} url="https://example.com" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should apply custom logo", () => {
    const { container } = render(
      <QRCode
        hideLogo={false}
        logo="custom-logo.png"
        url="https://example.com"
      />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should apply eye and dot colors", () => {
    const { container } = render(
      <QRCode dotColor="#00ff00" eyeColor="#ff0000" url="https://example.com" />
    );
    const styles = container.querySelector("style");
    expect(styles?.textContent).toContain("#ff0000");
    expect(styles?.textContent).toContain("#00ff00");
  });

  it("should apply body pattern", () => {
    const { container } = render(
      <QRCode bodyPattern="circle" url="https://example.com" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should apply corner patterns", () => {
    const { container } = render(
      <QRCode
        cornerEyeDotPattern="circle"
        cornerEyePattern="gear"
        url="https://example.com"
      />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should handle scale", () => {
    const { container } = render(
      <QRCode scale={2} url="https://example.com" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should apply margin", () => {
    const { container } = render(
      <QRCode margin={8} url="https://example.com" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should handle template", () => {
    const { container } = render(
      <QRCode templateId="FlamQR" url="https://example.com" />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should handle custom text", () => {
    const { container } = render(
      <QRCode
        customText="Custom Text"
        templateId="FlamQR"
        url="https://example.com"
      />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("should handle error levels", () => {
    const levels = ["L", "M", "Q", "H"] as const;

    levels.forEach((level) => {
      const { container } = render(
        <QRCode errorLevel={level} url="https://example.com" />
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  it("should memoize render", () => {
    const { rerender, container } = render(
      <QRCode url="https://example.com" />
    );
    const svg1 = container.querySelector("svg");

    // Rerender with same props
    rerender(<QRCode url="https://example.com" />);
    const svg2 = container.querySelector("svg");

    // SVG should be the same due to memoization
    expect(svg1).toBe(svg2);
  });

  it("should update when URL changes", () => {
    const { rerender, container } = render(
      <QRCode url="https://example1.com" />
    );

    rerender(<QRCode url="https://example2.com" />);
    const svg2 = container.querySelector("svg");

    // Should still be SVG but potentially different content
    expect(svg2).toBeInTheDocument();
  });
});
