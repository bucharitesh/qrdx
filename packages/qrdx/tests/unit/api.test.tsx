import { beforeEach, describe, expect, it, vi } from "vitest";
import { getQRAsSVG } from "../../src/api";

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    text: () => Promise.resolve("data:image/png;base64,mockbase64"),
  } as Response)
);

describe("getQRAsSVG", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate SVG element", async () => {
    const svg = await getQRAsSVG({ value: "test" });

    expect(svg).toBeDefined();
    expect(svg.type).toBe("svg");
  });

  it("should apply custom size", async () => {
    const svg = await getQRAsSVG({ value: "test", size: 500 });

    expect(svg.props.width).toBe(500);
    expect(svg.props.height).toBe(500);
  });

  it("should apply custom colors", async () => {
    const svg = await getQRAsSVG({
      value: "test",
      bgColor: "#ff0000",
      fgColor: "#00ff00",
    });

    expect(svg).toBeDefined();
    // Check that color paths exist
    const children = svg.props.children;
    expect(children).toBeDefined();
  });

  it("should handle different error levels", async () => {
    const levels = ["L", "M", "Q", "H"] as const;

    for (const level of levels) {
      const svg = await getQRAsSVG({ value: "test", level });
      expect(svg).toBeDefined();
      expect(svg.type).toBe("svg");
    }
  });

  it("should apply margin", async () => {
    const svg = await getQRAsSVG({ value: "test", margin: 8 });
    expect(svg).toBeDefined();

    const viewBox = svg.props.viewBox;
    expect(viewBox).toBeDefined();
    expect(typeof viewBox).toBe("string");
  });

  it("should handle image settings with external URL", async () => {
    const imageSettings = {
      src: "https://example.com/logo.png",
      width: 50,
      height: 50,
      excavate: true,
    };

    const svg = await getQRAsSVG({
      value: "test",
      imageSettings,
    });

    expect(svg).toBeDefined();
    expect(fetch).toHaveBeenCalled();

    // Check that fetch was called with wsrv.nl proxy
    const fetchCall = (fetch as any).mock.calls[0][0];
    expect(fetchCall).toContain("wsrv.nl");
  });

  it("should handle image settings without excavation", async () => {
    const imageSettings = {
      src: "https://example.com/logo.png",
      width: 50,
      height: 50,
      excavate: false,
    };

    const svg = await getQRAsSVG({
      value: "test",
      imageSettings,
    });

    expect(svg).toBeDefined();
  });

  it("should generate valid SVG structure", async () => {
    const svg = await getQRAsSVG({ value: "test" });

    expect(svg.props).toHaveProperty("xmlns");
    expect(svg.props.xmlns).toBe("http://www.w3.org/2000/svg");
    expect(svg.props).toHaveProperty("viewBox");
  });

  it("should include QR code path", async () => {
    const svg = await getQRAsSVG({ value: "test" });

    const children = Array.isArray(svg.props.children)
      ? svg.props.children
      : [svg.props.children];

    // Should have path elements for background and foreground
    const paths = children.filter((child: any) => child?.type === "path");
    expect(paths.length).toBeGreaterThan(0);
  });

  it("should handle additional SVG props", async () => {
    const svg = await getQRAsSVG({
      value: "test",
      className: "test-class",
      id: "test-id",
    } as any);

    expect(svg.props.className).toBe("test-class");
    expect(svg.props.id).toBe("test-id");
  });
});
