import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import {
  FRAME_STYLES,
  getFrameDimensions,
  getPrintLayout,
  getQRAsPrintPDFBuffer,
  getQRAsPrintSVG,
  type QRProps,
  rgbToCmyk,
  withQRSize,
} from "qrdx";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildSVGString } from "../src/render/output.js";

// jsqr ships with qrdx, so resolve it from there.
const require = createRequire(import.meta.url);
const jsQR = createRequire(require.resolve("qrdx/package.json"))(
  "jsqr"
) as typeof import("jsqr").default;

const VALUE = "https://qrdx.dev/q/Ab3dE9x";

async function decodeSVG(svg: string): Promise<string | null> {
  const { data, info } = await sharp(Buffer.from(svg))
    .extend({ top: 24, bottom: 24, left: 24, right: 24, background: "#fff" })
    .flatten({ background: "#ffffff" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return (
    jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null
  );
}

/** Concatenated, inflated content streams of a PDF. */
function pdfOperators(buffer: ArrayBuffer): string {
  const bytes = Buffer.from(buffer);
  const text = bytes.toString("latin1");
  let operators = "";
  for (const match of text.matchAll(/stream\r?\n/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const end = text.indexOf("endstream", start);
    try {
      operators += inflateSync(bytes.subarray(start, end)).toString("latin1");
    } catch {
      // Not a deflated stream
    }
  }
  return operators;
}

describe("frames", () => {
  it("grow the output but never the code", () => {
    for (const style of FRAME_STYLES) {
      const { width, height } = getFrameDimensions(400, { style });
      if (style === "none") {
        expect({ width, height }).toEqual({ width: 400, height: 400 });
      } else {
        expect(width).toBeGreaterThan(400);
        expect(height).toBeGreaterThan(400);
      }
    }
  });

  it("stay scannable with square modules", async () => {
    for (const style of FRAME_STYLES) {
      const svg = buildSVGString({
        value: VALUE,
        size: 300,
        bodyPattern: "square",
        cornerEyePattern: "square",
        cornerEyeDotPattern: "square",
        frame: { style, text: "Scan for the menu", color: "#1e3a8a" },
      });
      expect(await decodeSVG(svg), style).toBe(VALUE);
    }
  });
});

describe("withQRSize", () => {
  it("scales a logo laid out for another size", () => {
    const resized = withQRSize(
      {
        value: VALUE,
        size: 1024,
        imageSettings: { src: "x", width: 256, height: 256, excavate: true },
      },
      512
    );
    expect(resized.size).toBe(512);
    expect(resized.imageSettings).toMatchObject({ width: 128, height: 128 });
  });

  it("leaves props without an explicit size untouched", () => {
    const props: QRProps = {
      value: VALUE,
      imageSettings: { src: "x", width: 80, height: 80, excavate: true },
    };
    expect(withQRSize(props, 512).imageSettings?.width).toBe(80);
  });
});

describe("rgbToCmyk", () => {
  it("maps black to K only and white to no ink", () => {
    expect(rgbToCmyk(0, 0, 0)).toEqual([0, 0, 0, 1]);
    expect(rgbToCmyk(255, 255, 255)).toEqual([0, 0, 0, 0]);
    expect(rgbToCmyk(255, 0, 0)).toEqual([0, 1, 1, 0]);
  });
});

describe("print export", () => {
  it("computes the physical layout", () => {
    const layout = getPrintLayout(
      { value: VALUE },
      { size: 40, bleed: 3, cropMarks: true }
    );
    expect(layout.codeWidth).toBe(40);
    expect(layout.trimWidth).toBe(40);
    expect(layout.maxScanDistance).toBe(400);
    // Bleed plus room for crop marks on every side
    expect(layout.pageWidth).toBeCloseTo(40 + 2 * (3 + 2 + 5 + 1));
    expect(layout.moduleSize).toBeCloseTo(40 / layout.moduleCount);
  });

  it("converts inches and rejects tiny sizes", () => {
    expect(
      getPrintLayout({ value: VALUE }, { size: 1, unit: "in" }).codeWidth
    ).toBeCloseTo(25.4);
    expect(() => getPrintLayout({ value: VALUE }, { size: 2 })).toThrow(
      /between 5 mm/
    );
  });

  it("draws a vector PDF without raster images", async () => {
    const pdf = await getQRAsPrintPDFBuffer(
      {
        value: VALUE,
        bodyPattern: "circle",
        cornerEyePattern: "gear",
        frame: { style: "banner-bottom" },
      },
      { size: 40 }
    );
    const text = Buffer.from(pdf).toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).not.toContain("/Subtype /Image");
    const operators = pdfOperators(pdf);
    // Bézier curves for the round modules, and the frame label as text
    expect(operators).toMatch(/ c\n/);
    expect(operators).toContain("(Scan me) Tj");
  });

  it("writes only CMYK colors in CMYK mode", async () => {
    const pdf = await getQRAsPrintPDFBuffer(
      {
        value: VALUE,
        fgColor: "#1e3a8a",
        frame: { style: "border", color: "#e11d48" },
      },
      { size: 30, bleed: 3, cropMarks: true, colorMode: "cmyk" }
    );
    const operators = pdfOperators(pdf);
    expect(operators).toMatch(/ k\n/);
    expect(operators).not.toMatch(/ (rg|RG|g)\n/);
    // jsPDF's page setup writes one default "0 G"; nothing else is gray.
    expect(operators.match(/ G\n/g) ?? []).toHaveLength(1);
    // Crop marks in registration color
    expect(operators).toContain("1. 1. 1. 1. K");
  });

  it("sizes the print SVG in physical units", async () => {
    const svg = await getQRAsPrintSVG(
      { value: VALUE },
      { size: 2, unit: "in" }
    );
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toMatch(/<svg[^>]*width="2in"/);
    expect(svg).toMatch(/<svg[^>]*height="2in"/);
  });
});
