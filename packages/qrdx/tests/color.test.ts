// Color parsing (CSS Color 4 hex/rgb()/named), WCAG 2.x relative luminance and
// contrast ratio, and the naive CMYK conversion used for print.
import { describe, expect, it } from "vitest";
import {
  getContrastLevel,
  getContrastRatio,
  getLuminance,
  hexToRgb,
} from "../src/utils";
import { getSolidColor } from "../src/utils/color";
import { parseColor, rgbToCmyk } from "../src/utils/parse-color";
import { normalizeColorConfig } from "../types/color";

describe("parseColor", () => {
  it.each([
    ["#fff", { r: 255, g: 255, b: 255, a: 1 }],
    ["#FFFFFF", { r: 255, g: 255, b: 255, a: 1 }],
    ["#11223380", { r: 0x11, g: 0x22, b: 0x33, a: 0x80 / 255 }],
    ["#1238", { r: 0x11, g: 0x22, b: 0x33, a: 0x88 / 255 }],
    ["rgb(10, 20, 30)", { r: 10, g: 20, b: 30, a: 1 }],
    ["rgba(10,20,30,0.5)", { r: 10, g: 20, b: 30, a: 0.5 }],
    ["rgb(10 20 30 / 50%)", { r: 10, g: 20, b: 30, a: 0.5 }],
    ["  Navy ", { r: 0, g: 0, b: 128, a: 1 }],
    ["transparent", { r: 0, g: 0, b: 0, a: 0 }],
  ])("parses %s", (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it.each([
    "",
    "#12",
    "#12345",
    "#ggg",
    "rgb(1,2)",
    "hsl(0 0% 0%)",
    "notacolor",
    null,
    undefined,
  ])("returns null for %s", (input) => {
    expect(parseColor(input as string)).toBeNull();
  });

  it("reads percentage channels relative to 255", () => {
    const color = parseColor("rgb(100%, 0%, 50%)");
    expect(color?.r).toBe(255);
    expect(color?.g).toBe(0);
    expect(color?.b).toBeCloseTo(127.5, 0);
  });

  it("clamps out-of-range rgb() channels", () => {
    expect(parseColor("rgb(300, -5, 20)")).toEqual({
      r: 255,
      g: 0,
      b: 20,
      a: 1,
    });
  });
});

describe("WCAG contrast", () => {
  it("uses the WCAG relative luminance (black 0, white 1)", () => {
    expect(getLuminance(0, 0, 0)).toBe(0);
    expect(getLuminance(255, 255, 255)).toBeCloseTo(1, 10);
    // sRGB #777777 ≈ 0.184 (WCAG 2.x formula)
    expect(getLuminance(0x77, 0x77, 0x77)).toBeCloseTo(0.1845, 3);
  });

  it("gives 21:1 for black on white and 1:1 for identical colors", () => {
    expect(getContrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(getContrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(getContrastRatio("#336699", "#336699")).toBe(1);
  });

  it("matches published WCAG ratios", () => {
    // WebAIM contrast checker reference values
    expect(getContrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(getContrastRatio("#0000ff", "#ffffff")).toBeCloseTo(8.59, 2);
  });

  it("understands every color format the editor and themes accept", () => {
    expect(getContrastRatio("black", "white")).toBeCloseTo(21, 5);
    expect(getContrastRatio("rgb(0, 0, 0)", "#fff")).toBeCloseTo(21, 5);
  });

  it("treats a transparent background as the white paper it prints on", () => {
    expect(getContrastRatio("#000000", "transparent")).toBeCloseTo(21, 5);
    expect(getContrastRatio("#000000", "#ffffff00")).toBeCloseTo(21, 5);
  });

  it("expands shorthand hex", () => {
    expect(hexToRgb("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(hexToRgb("zzz")).toBeNull();
  });

  it.each([
    [21, "AAA", false],
    [7, "AAA", false],
    [4.5, "AA", false],
    [3, "AA Large", true],
    [2.9, "Fail", true],
  ])("rates %s:1 as %s", (ratio, level, warning) => {
    expect(getContrastLevel(ratio)).toMatchObject({ level, warning });
  });
});

describe("rgbToCmyk", () => {
  it.each<[[number, number, number], [number, number, number, number]]>([
    [
      [0, 0, 0],
      [0, 0, 0, 1],
    ],
    [
      [255, 255, 255],
      [0, 0, 0, 0],
    ],
    [
      [255, 0, 0],
      [0, 1, 1, 0],
    ],
    [
      [0, 255, 255],
      [1, 0, 0, 0],
    ],
    [
      [128, 128, 128],
      [0, 0, 0, 0.498],
    ],
  ])("converts rgb%j to cmyk%j", (rgb, cmyk) => {
    expect(rgbToCmyk(...rgb)).toEqual(cmyk);
  });
});

describe("color configs", () => {
  it("normalizes a hex string to a solid color", () => {
    expect(normalizeColorConfig("#123456")).toEqual({
      type: "solid",
      color: "#123456",
    });
  });

  it("uses the first stop of a gradient as its solid color", () => {
    expect(
      getSolidColor({
        type: "linear",
        angle: 0,
        stops: [
          { color: "#ff0000", offset: 0 },
          { color: "#0000ff", offset: 100 },
        ],
      })
    ).toBe("#ff0000");
    expect(getSolidColor(undefined, "#abcdef")).toBe("#abcdef");
  });
});
