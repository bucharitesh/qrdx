/** biome-ignore-all lint/style/noMagicNumbers: layout numbers under test */
// The engine options the editor exposes: per-eye colors (eyeColors), module
// size (moduleScale), logo size, clear space and position (getQRData's
// logoOptions) and autoLevel. Each decodes at three phone distances, the
// SVG, print PDF and EPS all draw it, and the scan score accounts for it.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { getQRAsEPS } from "../src/eps";
import { getQRData } from "../src/helpers";
import { getQRAsPrintPDFBuffer } from "../src/print";
import { QRCode } from "../src/qr-code";
import { getScanScore } from "../src/scan-score";
import { resolveErrorLevel } from "../src/utils";
import type { QRProps } from "../types";
import { installFakeDom } from "./support/fake-dom";
import {
  channelDistance,
  type RGB,
  rasterizeEps,
  rasterizePdf,
} from "./support/print-raster";
import { capture, PHONE_MODULE_SIZES, renderSvg } from "./support/qr";
import { createImage, decodeQR, toPng } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x?utm=campaign";

/** Modules across the symbol for VALUE at `level`. */
const modulesAt = (level: "L" | "M" | "Q" | "H") =>
  qrcodegen.QrCode.encodeText(VALUE, ERROR_LEVEL_MAP[level]).size;

let LOGO_PNG = "";
beforeAll(async () => {
  // An opaque mid-grey square: what a decoder sees under any real logo
  const png = await toPng(createImage(32, 32, "#7a7a7a"));
  LOGO_PNG = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
});

/** QRProps the way the editor builds them (getQRData + the rest). */
function editorProps(
  extra: Parameters<typeof getQRData>[0] & Partial<QRProps>
): QRProps {
  return {
    ...getQRData({ size: 256, margin: 4, ...extra }),
    level: extra.level,
    cornerEyePattern: extra.cornerEyePattern ?? "square",
    cornerEyeDotPattern: extra.cornerEyeDotPattern ?? "square",
  };
}

/** Pixels per module that fail to decode through the camera model. */
const unreadable = (props: QRProps) =>
  PHONE_MODULE_SIZES.filter(
    (modulePx) => capture(props, { modulePx }) !== props.value
  );

describe("getQRData logo layout", () => {
  it("keeps the old 25% centered logo without logoOptions", () => {
    expect(getQRData({ value: VALUE, logo: "data:,x" }).imageSettings).toEqual({
      src: "data:,x",
      width: 256,
      height: 256,
      excavate: true,
    });
  });

  it("sizes the logo as a share of the code's width", () => {
    const settings = getQRData({
      value: VALUE,
      logo: "data:,x",
      logoOptions: { size: 0.1 },
    }).imageSettings;
    expect(settings?.width).toBeCloseTo(102.4);
    expect(settings?.height).toBeCloseTo(102.4);
  });

  it("turns clear space in modules into pixels of this code", () => {
    const margin = 4;
    const level = "M";
    const settings = getQRData({
      value: VALUE,
      level,
      margin,
      logo: "data:,x",
      logoOptions: { padding: 2 },
    }).imageSettings;
    const modulePx = 1024 / (modulesAt(level) + 2 * margin);
    expect(settings?.padding).toBeCloseTo(2 * modulePx);
  });

  it("places the logo's center across the symbol and keeps it inside", () => {
    const margin = 2;
    const n = modulesAt("H");
    const symbolPx = (1024 * n) / (n + 2 * margin);
    const at = (x: number, y: number) =>
      getQRData({
        value: VALUE,
        level: "H",
        margin,
        logo: "data:,x",
        logoOptions: { size: 0.2, x, y },
      }).imageSettings;
    const w = 1024 * 0.2;
    expect(at(0.6, 0.4)?.x).toBeCloseTo(0.6 * symbolPx - w / 2);
    expect(at(0.6, 0.4)?.y).toBeCloseTo(0.4 * symbolPx - w / 2);
    // Clamped to the symbol's edges
    expect(at(0, 1)?.x).toBe(0);
    expect(at(0, 1)?.y).toBeCloseTo(symbolPx - w);
  });

  it("lays the logo out again at the level autoLevel raises to", () => {
    const options = {
      value: VALUE,
      level: "L" as const,
      margin: 4,
      logo: "data:,x",
      logoOptions: { size: 0.3, padding: 1 },
      autoLevel: true,
    };
    const data = getQRData(options);
    expect(data.autoLevel).toBe(true);
    expect(resolveErrorLevel(data)).toBe("H");
    const modulePx = 1024 / (modulesAt("H") + 8);
    expect(data.imageSettings?.padding).toBeCloseTo(modulePx);
  });

  it("passes per-eye colors and module size through", () => {
    const eyeColors = { topLeft: { outer: "#b91c1c" } };
    const data = getQRData({ value: VALUE, eyeColors, moduleScale: 0.8 });
    expect(data.eyeColors).toEqual(eyeColors);
    expect(data.moduleScale).toBe(0.8);
    expect(getQRData({ value: VALUE })).not.toHaveProperty("eyeColors");
  });
});

describe("<QRCode> scales the whole logo layout", () => {
  it("draws the logo where getQRData put it, at the rendered size", () => {
    const logoOptions = { size: 0.2, x: 0.3, y: 0.7, padding: 1 };
    const markup = renderToStaticMarkup(
      createElement(QRCode, {
        value: VALUE,
        size: 256,
        margin: 2,
        level: "H",
        logo: LOGO_PNG,
        logoOptions,
      })
    );
    const data = getQRData({
      value: VALUE,
      level: "H",
      margin: 2,
      logo: LOGO_PNG,
      logoOptions,
    });
    const ratio = 256 / 1024;
    const n = modulesAt("H") + 4;
    const pixel = 256 / n;
    const expectedX =
      (((data.imageSettings?.x ?? 0) * ratio * n) / 256) * pixel + 2 * pixel;
    const x = Number(/<image[^>]* x="([\d.]+)"/.exec(markup)?.[1]);
    expect(x).toBeCloseTo(expectedX, 1);
  });
});

describe("each option decodes at three phone distances", () => {
  const cases: [string, () => QRProps][] = [
    [
      "per-eye colors",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          eyeColors: {
            topLeft: { outer: "#b91c1c", inner: "#1d4ed8" },
            topRight: { outer: "#15803d" },
            bottomLeft: { inner: "#7e22ce" },
          },
        }),
    ],
    [
      "square dots at 75%",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          bodyPattern: "square",
          moduleScale: 0.75,
        }),
    ],
    [
      "classy dots at 70%",
      () =>
        editorProps({
          value: VALUE,
          level: "M",
          bodyPattern: "classy",
          moduleScale: 0.7,
        }),
    ],
    [
      "a 20% logo with a module of clear space on H",
      () =>
        editorProps({
          value: VALUE,
          level: "H",
          bodyPattern: "square",
          logo: LOGO_PNG,
          logoOptions: { size: 0.2, padding: 1 },
        }),
    ],
    [
      "a small logo moved off center",
      () =>
        editorProps({
          value: VALUE,
          level: "H",
          bodyPattern: "square",
          logo: LOGO_PNG,
          logoOptions: { size: 0.15, x: 0.7, y: 0.65 },
        }),
    ],
    [
      "a 25% logo on L with autoLevel (drawn at H)",
      () =>
        editorProps({
          value: VALUE,
          level: "L",
          bodyPattern: "square",
          logo: LOGO_PNG,
          logoOptions: { size: 0.25 },
          autoLevel: true,
        }),
    ],
  ];
  for (const [name, props] of cases) {
    it(name, () => {
      expect(unreadable(props()), "px per module that failed").toEqual([]);
    });
  }

  it("a 25% logo on L without autoLevel does not read (what autoLevel fixes)", () => {
    const props = editorProps({
      value: VALUE,
      level: "L",
      bodyPattern: "square",
      logo: LOGO_PNG,
      logoOptions: { size: 0.25 },
    });
    expect(unreadable(props).length).toBeGreaterThan(0);
  });
});

describe("SVG, print PDF and EPS draw them", () => {
  const EYES = {
    topLeft: { outer: "#b91c1c", inner: "#1d4ed8" },
    topRight: { outer: "#15803d", inner: "#b45309" },
    bottomLeft: { outer: "#7e22ce", inner: "#0f766e" },
  };
  const props = () =>
    editorProps({
      value: VALUE,
      level: "H",
      bodyPattern: "square",
      eyeColors: EYES,
      moduleScale: 0.8,
      logo: LOGO_PNG,
      logoOptions: { size: 0.2, x: 0.6, y: 0.55, padding: 1 },
    });
  const hexes = Object.values(EYES).flatMap((eye) => [eye.outer, eye.inner]);
  const rgb = (hex: string): RGB =>
    [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as RGB;
  /** jsPDF writes channels with 2-3 decimals: allow 2/255 */
  const painted = (fills: RGB[], hex: string) =>
    fills.some((fill) => channelDistance(fill, rgb(hex)) <= 2);

  it("SVG: every eye color, scaled modules and the moved logo", () => {
    const svg = renderSvg(props());
    for (const color of hexes) expect(svg).toContain(`fill="${color}"`);
    expect(svg).toMatch(/scale\(0\.8\)/);
    const x = Number(/<image[^>]* x="([\d.]+)"/.exec(svg)?.[1]);
    // Moved right of center: the logo starts past the middle minus half its width
    expect(x).toBeGreaterThan(128 - 25.6);
    expect(capture(props(), { modulePx: 6 })).toBe(VALUE);
  });

  it("print PDF: decodes, with every eye color", async () => {
    const buffer = await getQRAsPrintPDFBuffer(props(), {
      size: 50,
      unit: "mm",
    });
    const rendered = rasterizePdf(buffer, 3);
    expect(decodeQR(rendered.image)).toBe(VALUE);
    for (const color of hexes) {
      expect(painted(rendered.fills, color), color).toBe(true);
    }
  });

  it("EPS: decodes, with every eye color", async () => {
    const eps = await getQRAsEPS(props(), { sizeMm: 50 });
    const rendered = rasterizeEps(eps, 3);
    expect(decodeQR(rendered.image)).toBe(VALUE);
    for (const color of hexes) {
      expect(painted(rendered.fills, color), color).toBe(true);
    }
    expect(eps).toContain("/ImageType 1");
  });
});

describe("the scan score accounts for them", () => {
  let uninstall: () => void;
  beforeAll(() => {
    uninstall = installFakeDom();
  });
  afterAll(() => uninstall());

  it("fails a logo moved over a corner eye", async () => {
    const result = await getScanScore(
      editorProps({
        value: VALUE,
        level: "H",
        bodyPattern: "square",
        logo: LOGO_PNG,
        logoOptions: { size: 0.2, x: 0, y: 0 },
      })
    );
    const logo = result.checks.find((check) => check.id === "logo");
    expect(logo?.passed).toBe(false);
    expect(logo?.message).toMatch(/corner eye/);
  });

  it("fails a logo moved over the bottom-right alignment pattern", async () => {
    // Version 3 at H: the alignment pattern spans modules 20–24
    const props = editorProps({
      value: "https://qrdx.dev/q/Ab3dE9x",
      level: "H",
      margin: 2,
      bodyPattern: "square",
      logo: LOGO_PNG,
      logoOptions: { size: 0.2, padding: 1, x: 0.62, y: 0.6 },
    });
    const result = await getScanScore(props);
    const logo = result.checks.find((check) => check.id === "logo");
    expect(logo?.passed).toBe(false);
    expect(logo?.message).toMatch(/bottom-right/);
    // Centered, the same logo reads and passes
    const centered = await getScanScore({
      ...props,
      ...getQRData({
        value: props.value,
        size: 256,
        level: "H",
        margin: 2,
        logo: LOGO_PNG,
        logoOptions: { size: 0.2, padding: 1 },
      }),
    });
    expect(centered.checks.find((c) => c.id === "logo")?.passed).toBe(true);
  });

  it("counts a bigger logo and its clear space against error correction", async () => {
    const small = await getScanScore(
      editorProps({
        value: VALUE,
        level: "M",
        bodyPattern: "square",
        logo: LOGO_PNG,
        logoOptions: { size: 0.12 },
      })
    );
    const big = await getScanScore(
      editorProps({
        value: VALUE,
        level: "M",
        bodyPattern: "square",
        logo: LOGO_PNG,
        logoOptions: { size: 0.3, padding: 2 },
      })
    );
    expect(small.checks.find((c) => c.id === "logo")?.passed).toBe(true);
    expect(big.checks.find((c) => c.id === "logo")?.passed).toBe(false);
  });

  it("checks contrast of each eye's own colors", async () => {
    const result = await getScanScore(
      editorProps({
        value: VALUE,
        level: "M",
        eyeColors: { bottomLeft: { outer: "#f4f4f5" } },
      })
    );
    expect(result.checks.find((c) => c.id === "contrast")?.passed).toBe(false);
  });
});
