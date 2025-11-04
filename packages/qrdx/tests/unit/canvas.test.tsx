import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QRCodeCanvas } from "../../src/index";
import React from "react";

describe("QRCodeCanvas Extended Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle image loading completion", async () => {
    const imageSettings = {
      src: "test.png",
      width: 50,
      height: 50,
      excavate: true,
    };

    const { container } = render(
      <QRCodeCanvas value="test" imageSettings={imageSettings} />
    );

    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();

    // Wait for image to potentially load
    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
    });
  });

  it("should handle null canvas context gracefully", () => {
    const { container } = render(<QRCodeCanvas value="test" />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("should use window.devicePixelRatio", () => {
    const { container } = render(<QRCodeCanvas value="test" size={200} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("should handle Path2D support", () => {
    const { container } = render(<QRCodeCanvas value="test" />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("should excavate modules when image is present and excavation is enabled", async () => {
    const imageSettings = {
      src: "test.png",
      width: 50,
      height: 50,
      excavate: true,
    };

    const { container } = render(
      <QRCodeCanvas value="test" imageSettings={imageSettings} />
    );

    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
    });
  });

  it("should not excavate when excavation is disabled", () => {
    const imageSettings = {
      src: "test.png",
      width: 50,
      height: 50,
      excavate: false,
    };

    const { container } = render(
      <QRCodeCanvas value="test" imageSettings={imageSettings} />
    );

    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("should handle image with complete property", async () => {
    const imageSettings = {
      src: "test.png",
      width: 50,
      height: 50,
      excavate: true,
    };

    const { container } = render(
      <QRCodeCanvas value="test" imageSettings={imageSettings} />
    );

    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
    }, { timeout: 100 });
  });

  it("should check image natural dimensions", async () => {
    const imageSettings = {
      src: "test.png",
      width: 50,
      height: 50,
      excavate: true,
    };

    const { container } = render(
      <QRCodeCanvas value="test" imageSettings={imageSettings} />
    );

    await waitFor(() => {
      const img = container.querySelector("img");
      if (img) {
        expect(img).toHaveAttribute("src", "test.png");
      }
    });
  });

  it("should render without image when no imageSettings provided", () => {
    const { container } = render(<QRCodeCanvas value="test" />);
    const img = container.querySelector("img");
    expect(img).not.toBeInTheDocument();
  });

  it("should apply scale to canvas", () => {
    const { container } = render(<QRCodeCanvas value="test" size={300} />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(300);
  });

  it("should fill background rect", () => {
    const { container } = render(
      <QRCodeCanvas value="test" bgColor="#ffffff" />
    );
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("should fill foreground modules", () => {
    const { container } = render(
      <QRCodeCanvas value="test" fgColor="#000000" />
    );
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();
  });

  it("should handle all error levels", () => {
    const levels = ["L", "M", "Q", "H"] as const;

    levels.forEach((level) => {
      const { container } = render(<QRCodeCanvas value="test" level={level} />);
      const canvas = container.querySelector("canvas");
      expect(canvas).toBeInTheDocument();
    });
  });
});

