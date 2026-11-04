/** biome-ignore-all lint/style/noMagicNumbers: geometry under test */
// Circle codes (shape: "circle"): the symbol in the middle of a disc of
// decorative modules, behind a quiet ring of at least QR_CIRCLE_QUIET_MIN.
// Each solid body decodes at three phone distances through the camera model
// and in sharp renders, the print PDF and EPS draw the disc and decode, and
// the layout maths (logo, print module count) follows the bigger margin.
import { describe, expect, it } from "vitest";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { getQRAsEPS } from "../src/eps";
import { getQRData } from "../src/helpers";
import { getQRAsPrintPDFBuffer, getQRModuleCount } from "../src/print";
import {
  circleDecoration,
  circleQuietZone,
  getLayoutMargin,
} from "../src/qr-shape";
import type { BodyPattern, CornerEyePattern, QRProps } from "../types";
import { QR_CIRCLE_QUIET_MIN } from "../types/qr";
import { rasterizeEps, rasterizePdf } from "./support/print-raster";
import { capture, PHONE_MODULE_SIZES, renderSvg } from "./support/qr";
import { decodeQR } from "./support/raster";

const VALUES = [
  "https://qrdx.dev/q/Ab3dE9x?utm=campaign",
  "https://example.com",
  "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;;",
];
const VALUE = VALUES[0] as string;
const symbol = (value: string, level: "M" | "H" = "M") =>
  qrcodegen.QrCode.encodeText(value, ERROR_LEVEL_MAP[level]).size;

const circleCode = (extra: Partial<QRProps> = {}): QRProps => ({
  value: VALUE,
  size: 512,
  level: "M",
  shape: "circle",
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "rounded",
  ...extra,
});

describe("layout", () => {
  it("keeps a square code's margin", () => {
    expect(getLayoutMargin(29, 2, "square")).toBe(2);
    expect(getLayoutMargin(29, 2, undefined)).toBe(2);
  });

  it("fits the symbol and its quiet ring inside the disc", () => {
    for (const n of [21, 29, 45, 77]) {
      for (const margin of [0, 3, 6]) {
        const layout = getLayoutMargin(n, margin, "circle");
        const quiet = circleQuietZone(margin);
        expect(quiet).toBeGreaterThanOrEqual(QR_CIRCLE_QUIET_MIN);
        // The ring's corner lies inside the disc's radius
        expect((n / 2 + quiet) * Math.SQRT2).toBeLessThan(n / 2 + layout);
      }
    }
  });

  it("decorates only outside the quiet ring and inside the disc", () => {
    const n = symbol(VALUE);
    const layout = getLayoutMargin(n, 0, "circle");
    const grid = circleDecoration(VALUE, n, 0);
    const size = n + 2 * layout;
    expect(grid).toHaveLength(size);
    const quiet = circleQuietZone(0);
    let dark = 0;
    let cells = 0;
    for (const [y, row] of grid.entries()) {
      for (const [x, on] of row.entries()) {
        const inRing =
          x >= layout - quiet &&
          x < layout + n + quiet &&
          y >= layout - quiet &&
          y < layout + n + quiet;
        const inDisc =
          Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= size / 2 - 1;
        if (on) expect(inRing || !inDisc, `${x},${y}`).toBe(false);
        if (!inRing && inDisc) {
          cells++;
          if (on) dark++;
        }
      }
    }
    // About half dark, like data, and the same for the same value
    expect(dark / cells).toBeGreaterThan(0.4);
    expect(dark / cells).toBeLessThan(0.6);
    expect(circleDecoration(VALUE, n, 0)).toEqual(grid);
  });

  it("draws a disc, not a square, behind the code", () => {
    const svg = renderSvg(circleCode());
    expect(svg).toMatch(/<circle cx="256" cy="256" fill="[^"]+" r="256"/);
    expect(renderSvg({ ...circleCode(), shape: "square" })).not.toMatch(
      /r="256"/
    );
  });

  it("counts the disc's modules for print and lays a logo out in them", () => {
    const n = symbol(VALUE, "H");
    const layout = getLayoutMargin(n, 2, "circle");
    expect(getQRModuleCount({ ...circleCode(), level: "H", margin: 2 })).toBe(
      n + 2 * layout
    );
    const settings = getQRData({
      value: VALUE,
      level: "H",
      margin: 2,
      shape: "circle",
      logo: "data:,x",
      logoOptions: { padding: 1 },
    }).imageSettings;
    expect(settings?.padding).toBeCloseTo(1024 / (n + 2 * layout));
  });
});

describe("circle codes decode", () => {
  const bodies: BodyPattern[] = ["square", "rounded", "classy", "liquid"];
  const eyes: CornerEyePattern[] = ["square", "rounded", "gear"];
  for (const bodyPattern of bodies) {
    for (const cornerEyePattern of eyes) {
      it(`${bodyPattern} body, ${cornerEyePattern} eyes`, () => {
        const misses: string[] = [];
        for (const value of VALUES) {
          const props = circleCode({ value, bodyPattern, cornerEyePattern });
          for (const modulePx of PHONE_MODULE_SIZES) {
            if (capture(props, { modulePx }) !== value)
              misses.push(`camera ${modulePx}px ${value}`);
          }
          for (const modulePx of [6, 9, 14]) {
            if (capture(props, { modulePx, camera: false }) !== value)
              misses.push(`sharp ${modulePx}px ${value}`);
          }
        }
        expect(misses).toEqual([]);
      });
    }
  }

  it("with a centered logo on H", () => {
    const props: QRProps = {
      ...getQRData({
        value: VALUE,
        size: 512,
        level: "H",
        shape: "circle",
        logo: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#1d4ed8"/></svg>')}`,
        logoOptions: { size: 0.15 },
      }),
      level: "H",
      bodyPattern: "rounded",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "rounded",
    };
    expect(
      PHONE_MODULE_SIZES.filter(
        (modulePx) => capture(props, { modulePx }) !== VALUE
      )
    ).toEqual([]);
  });
});

describe("print PDF and EPS", () => {
  it("PDF draws the disc and decodes", async () => {
    const buffer = await getQRAsPrintPDFBuffer(circleCode(), {
      size: 60,
      unit: "mm",
    });
    expect(decodeQR(rasterizePdf(buffer, 3).image)).toBe(VALUE);
  });

  it("EPS draws the disc and decodes", async () => {
    const eps = await getQRAsEPS(circleCode(), { sizeMm: 60 });
    expect(decodeQR(rasterizeEps(eps, 3).image)).toBe(VALUE);
  });
});
