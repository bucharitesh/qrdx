import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import {
  createQRArtImage,
  FRAME_STYLES,
  getFrameDimensions,
  getPrintLayout,
  getQRAsEPS,
  getQRAsPrintPDFBuffer,
  getQRAsPrintSVG,
  getQRFunctionModules,
  isQRArtActive,
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

describe("art modes", () => {
  const artImage = async (svg: string, maxSize: number) => {
    const { data, info } = await sharp(Buffer.from(svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return createQRArtImage(
      { data, width: info.width, height: info.height },
      { maxSize }
    );
  };
  const logo = () =>
    artImage(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="80" fill="#e11d48"/><circle cx="100" cy="100" r="35" fill="#f59e0b"/></svg>`,
      64
    );
  const photo = () =>
    artImage(
      `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs><rect width="240" height="160" fill="url(#g)"/><circle cx="80" cy="70" r="40" fill="#fde047"/><rect x="130" y="60" width="80" height="90" fill="#14532d"/></svg>`,
      96
    );

  it("samples images into a compact RGBA grid", async () => {
    const image = await photo();
    expect(image.width).toBe(96);
    expect(image.height).toBe(64);
    expect(Buffer.from(image.data, "base64")).toHaveLength(96 * 64 * 4);
    expect(isQRArtActive({ mode: "halftone", image })).toBe(true);
    expect(
      isQRArtActive({ mode: "halftone", image: { ...image, width: 95 } })
    ).toBe(false);
  });

  it("marks finder, timing, alignment and version modules", () => {
    const mask = getQRFunctionModules(7);
    expect(mask).toHaveLength(45);
    expect(mask[0]?.[0]).toBe(true); // finder
    expect(mask[6]?.[20]).toBe(true); // timing
    expect(mask[22]?.[22]).toBe(true); // alignment center
    expect(mask[0]?.[34]).toBe(true); // version block
    expect(mask[12]?.[12]).toBe(false); // data
  });

  for (const mode of ["logo", "halftone"] as const) {
    it(`${mode} mode stays scannable from subtle to full intensity`, async () => {
      const image = mode === "logo" ? await logo() : await photo();
      for (const intensity of [0.3, 0.6, 1]) {
        const svg = buildSVGString({
          value: VALUE,
          size: 400,
          margin: 2,
          level: "H",
          cornerEyePattern: "square",
          cornerEyeDotPattern: "square",
          art: { mode, image, intensity },
        });
        expect(svg).toContain(`data-qrdx-art="${mode}"`);
        expect(await decodeSVG(svg), `${mode} ${intensity}`).toBe(VALUE);
      }
    });
  }

  it("draws the art layer only with a usable image", () => {
    const svg = buildSVGString({
      value: VALUE,
      art: {
        mode: "halftone",
        image: { width: 2, height: 2, data: "broken" },
      },
    });
    expect(svg).not.toContain("data-qrdx-art");
  });
});

describe("getQRAsEPS", () => {
  it("is sized in points from millimetres and keeps colors", async () => {
    const eps = await getQRAsEPS(
      { value: VALUE, fgColor: "#155dfc" },
      { sizeMm: 25.4 }
    );
    expect(eps).toContain("%%BoundingBox: 0 0 72 72");
    expect(eps).toContain("%%HiResBoundingBox: 0 0 72 72");
    expect(eps).toContain("0.082 0.365 0.988 rg");
  });

  it("writes CMYK and fills the bleed", async () => {
    const eps = await getQRAsEPS(
      { value: VALUE, bgColor: "#fef3c7" },
      { sizeMm: 25.4, bleedMm: 3, colorMode: "cmyk" }
    );
    const bleed = (3 * 72) / 25.4;
    expect(eps).toContain(
      `%%BoundingBox: 0 0 ${Math.ceil(72 + 2 * bleed)} ${Math.ceil(72 + 2 * bleed)}`
    );
    expect(eps).toContain(" cmyk ");
    expect(eps).not.toMatch(/ rg /);
  });

  it("flattens gradients to their first color", async () => {
    const eps = await getQRAsEPS({
      value: VALUE,
      fgColor: {
        type: "linear",
        angle: 0,
        stops: [
          { color: "#ff0000", offset: 0 },
          { color: "#0000ff", offset: 100 },
        ],
      },
    });
    expect(eps).toContain("1 0 0 rg");
  });
});
