// Export formats checked against their specs: SVG is well-formed XML in the
// SVG namespace; EPS follows Adobe's EPSF 3.0 / DSC 3.0 header rules; PDFs
// start with "%PDF-" and end with "%%EOF" (ISO 32000-1 §7.5); print sizes
// convert exactly (1 in = 25.4 mm = 72 pt).
import { describe, expect, it } from "vitest";
import { PRESET_SIZES, validateSize, withQRSize } from "../src/download";
import { epsToDataUrl, getQRAsEPS, svgToEPS } from "../src/eps";
import { getQRData } from "../src/helpers";
import { getQRAsSVGDataUri } from "../src/index";
import {
  getPrintLayout,
  getQRAsPrintPDFBuffer,
  getQRAsPrintSVG,
  getQRModuleCount,
} from "../src/print";
import type { QRProps } from "../types";
import { renderSvg, symbolSize } from "./support/qr";
import { decodeQR, rasterizeSvg } from "./support/raster";
import { xmlProblems } from "./support/xml";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const POINTS_PER_MM = 72 / 25.4;

const svgFromDataUri = (uri: string) =>
  decodeURIComponent(uri.replace("data:image/svg+xml,", ""));

describe("SVG", () => {
  it.each<[string, QRProps]>([
    ["default", { value: VALUE }],
    [
      "gradient",
      {
        value: VALUE,
        fgColor: {
          type: "radial",
          stops: [
            { color: "#000", offset: 0 },
            { color: "#333", offset: 100 },
          ],
        },
      },
    ],
    [
      "framed",
      {
        value: VALUE,
        frame: { style: "banner-bottom", text: 'Scan <me> & "go"' },
      },
    ],
    ["templated", { value: VALUE, templateId: "Arrow" }],
  ])("%s export is well-formed SVG XML", async (_name, props) => {
    const svg = svgFromDataUri(await getQRAsSVGDataUri(props));
    expect(xmlProblems(svg)).toEqual([]);
    expect(svg).toMatch(/^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("escapes frame text instead of injecting markup", async () => {
    const svg = svgFromDataUri(
      await getQRAsSVGDataUri({
        value: VALUE,
        frame: { style: "banner-top", text: "<script>x</script>" },
      })
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("sizes the SVG to the requested pixels and keeps it square", () => {
    const svg = renderSvg({ value: VALUE, size: 333 });
    expect(svg).toMatch(/^<svg height="333"[^>]* width="333"/);
  });

  it("data URI decodes back to a scannable code", async () => {
    const svg = svgFromDataUri(
      await getQRAsSVGDataUri({
        value: VALUE,
        size: 300,
        margin: 4,
        bodyPattern: "square",
      })
    );
    expect(decodeQR(rasterizeSvg(svg))).toBe(VALUE);
  });
});

describe("EPS", () => {
  it("writes a valid EPSF 3.0 header with an integer bounding box", async () => {
    const eps = await getQRAsEPS({ value: VALUE }, { sizeMm: 50 });
    const lines = eps.split("\n");
    expect(lines[0]).toBe("%!PS-Adobe-3.0 EPSF-3.0");
    const side = 50 * POINTS_PER_MM; // 141.73 pt
    expect(lines[1]).toBe(
      `%%BoundingBox: 0 0 ${Math.ceil(side)} ${Math.ceil(side)}`
    );
    expect(eps).toMatch(/%%HiResBoundingBox: 0 0 141\.73\d* 141\.73\d*/);
    // Header comments end before any PostScript code.
    expect(eps.indexOf("%%EndComments")).toBeLessThan(
      eps.indexOf("%%BeginProlog")
    );
    expect(eps.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("is 7-bit clean ASCII with balanced graphics state", async () => {
    const eps = await getQRAsEPS({
      value: "Zoë 👋 東京",
      frame: { style: "banner-bottom", text: "Scannez-moi ✓" },
    });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: tab, LF and CR are allowed in 7-bit EPS
    expect(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(eps)).toBe(true);
    const count = (word: string) =>
      (eps.match(new RegExp(`\\b${word}\\b`, "g")) ?? []).length;
    expect(count("gsave")).toBe(count("grestore"));
  });

  it("grows the bounding box by the bleed on every side", async () => {
    const eps = await getQRAsEPS({ value: VALUE }, { sizeMm: 30, bleedMm: 3 });
    const side = 36 * POINTS_PER_MM;
    expect(eps).toContain(
      `%%BoundingBox: 0 0 ${Math.ceil(side)} ${Math.ceil(side)}`
    );
  });

  it("writes CMYK colors in cmyk mode and RGB otherwise", async () => {
    const rgb = await getQRAsEPS({ value: VALUE, fgColor: "#ff0000" });
    const cmyk = await getQRAsEPS(
      { value: VALUE, fgColor: "#ff0000" },
      { colorMode: "cmyk" }
    );
    // The prolog binds rg → setrgbcolor and cmyk → setcmykcolor.
    expect(rgb).toMatch(/\/rg \{setrgbcolor\}/);
    expect(rgb).toMatch(/(^|\s)1 0 0 rg(\s|$)/m);
    expect(cmyk).toMatch(/(^|\s)0 1 1 0 cmyk(\s|$)/m);
    expect(cmyk).not.toMatch(/(^|\s)1 0 0 rg(\s|$)/m);
  });

  it("rejects a non-positive width", async () => {
    await expect(
      svgToEPS(renderSvg({ value: VALUE }), { width: 0 })
    ).rejects.toThrow(/positive/);
  });

  it("encodes to a base64 application/postscript data URL", () => {
    const url = epsToDataUrl("%!PS-Adobe-3.0 EPSF-3.0\n");
    expect(url.startsWith("data:application/postscript;base64,")).toBe(true);
    expect(atob(url.split(",")[1] as string)).toBe("%!PS-Adobe-3.0 EPSF-3.0\n");
  });
});

describe("print PDF", () => {
  const text = (buffer: ArrayBuffer) =>
    new TextDecoder("latin1").decode(buffer);

  it("starts with %PDF- and ends with %%EOF", async () => {
    const pdf = text(
      await getQRAsPrintPDFBuffer({ value: VALUE }, { size: 40 })
    );
    expect(pdf.startsWith("%PDF-1.")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("sizes the page to the trim plus bleed, in points", async () => {
    const pdf = text(
      await getQRAsPrintPDFBuffer({ value: VALUE }, { size: 40, bleed: 3 })
    );
    const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf);
    expect(box).not.toBeNull();
    const expected = 46 * POINTS_PER_MM; // 40 mm + 2 × 3 mm bleed
    expect(Number(box?.[1])).toBeCloseTo(expected, 1);
    expect(Number(box?.[2])).toBeCloseTo(expected, 1);
  });
});

describe("print layout", () => {
  it("converts inches exactly (1 in = 25.4 mm)", () => {
    const layout = getPrintLayout({ value: VALUE }, { size: 2, unit: "in" });
    expect(layout.codeWidth).toBeCloseTo(50.8, 10);
  });

  it("derives module size from the module count, margin included", () => {
    const props: QRProps = { value: VALUE, margin: 2 };
    const layout = getPrintLayout(props, { size: 33 });
    expect(layout.moduleCount).toBe(symbolSize(VALUE) + 4);
    expect(layout.moduleSize).toBeCloseTo(33 / getQRModuleCount(props), 10);
  });

  it("adds bleed and crop-mark room around the trim box", () => {
    const layout = getPrintLayout(
      { value: VALUE },
      { size: 40, bleed: 3, cropMarks: true }
    );
    expect(layout.trimX).toBeGreaterThan(3);
    expect(layout.pageWidth).toBeCloseTo(
      layout.trimWidth + 2 * layout.trimX,
      10
    );
  });

  it("clamps bleed to 0–20 mm", () => {
    expect(
      getPrintLayout({ value: VALUE }, { size: 40, bleed: -5 }).bleed
    ).toBe(0);
    expect(
      getPrintLayout({ value: VALUE }, { size: 40, bleed: 99 }).bleed
    ).toBe(20);
  });

  it.each([
    4.9,
    2001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects a %s mm code", (size) => {
    expect(() => getPrintLayout({ value: VALUE }, { size })).toThrow(
      /between 5 mm and 2 m/
    );
  });

  it("makes the frame part of the trim size", () => {
    const plain = getPrintLayout({ value: VALUE }, { size: 40 });
    const framed = getPrintLayout(
      { value: VALUE, frame: { style: "banner-bottom" } },
      { size: 40 }
    );
    expect(framed.codeWidth).toBe(plain.codeWidth);
    expect(framed.trimHeight).toBeGreaterThan(plain.trimHeight);
  });

  it("writes the physical size into the print SVG", async () => {
    const svg = await getQRAsPrintSVG({ value: VALUE }, { size: 40 });
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toMatch(/<svg[^>]* width="40mm"/);
    expect(svg).toMatch(/<svg[^>]* height="40mm"/);
    expect(xmlProblems(svg)).toEqual([]);
    const inches = await getQRAsPrintSVG(
      { value: VALUE },
      { size: 1.5, unit: "in" }
    );
    expect(inches).toMatch(/ width="1\.5in"/);
  });
});

describe("download sizes", () => {
  it.each([
    [50, 50, true],
    [5000, 5000, true],
    [49, 49, false],
    [5001, 5001, false],
    [400, 300, false],
    [Number.NaN, Number.NaN, false],
  ])("validateSize(%s, %s) → valid %s", (width, height, valid) => {
    expect(validateSize(width, height).isValid).toBe(valid);
  });

  it("explains why a size is rejected", () => {
    expect(validateSize(10, 10).error).toMatch(/at least 50/);
    expect(validateSize(9000, 9000).error).toMatch(/not exceed 5000/);
    expect(validateSize(100, 200).error).toMatch(/equal/);
  });

  it("offers only square presets inside the valid range", () => {
    for (const [name, { width, height }] of Object.entries(PRESET_SIZES)) {
      expect(validateSize(width, height).isValid, name).toBe(true);
    }
  });

  it("scales a logo laid out for one size to another", () => {
    const props = withQRSize(
      {
        value: VALUE,
        size: 1024,
        imageSettings: {
          src: "data:,",
          width: 256,
          height: 256,
          excavate: true,
          x: 384,
          y: 384,
        },
      },
      512
    );
    expect(props.size).toBe(512);
    expect(props.imageSettings).toMatchObject({
      width: 128,
      height: 128,
      x: 192,
      y: 192,
    });
  });

  it("leaves props without a logo alone apart from the size", () => {
    expect(withQRSize({ value: VALUE, size: 100 }, 400)).toEqual({
      value: VALUE,
      size: 400,
    });
  });
});

describe("getQRData", () => {
  it("passes styling through and stringifies the value", () => {
    const data = getQRData({
      value: 12_345 as unknown as string,
      level: "H",
      margin: 2,
    });
    expect(data).toMatchObject({
      value: "12345",
      level: "H",
      margin: 2,
      size: 1024,
    });
    expect(data.imageSettings).toBeUndefined();
  });

  it("adds an excavated 25% logo only when one is given and not hidden", () => {
    expect(getQRData({ value: VALUE, logo: "data:,x" }).imageSettings).toEqual({
      src: "data:,x",
      width: 256,
      height: 256,
      excavate: true,
    });
    expect(
      getQRData({ value: VALUE, logo: "data:,x", hideLogo: true }).imageSettings
    ).toBeUndefined();
  });
});
