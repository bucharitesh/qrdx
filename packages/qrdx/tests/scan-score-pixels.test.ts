// getScanScoreFromPixels is getScanScore for servers: it decodes pixels the
// caller rasterized instead of drawing the SVG on a canvas. Both share every
// check and weight, so for the same design they must agree on the grade, and
// the static checks (contrast, logo, quiet zone, eyes) must be identical.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFrameDimensions } from "../src/frame";
import {
  getScanScore,
  getScanScoreFromPixels,
  PIXEL_SCORE_MIN_CODE_WIDTH,
} from "../src/scan-score";
import type { QRProps } from "../types";
import { installFakeDom } from "./support/fake-dom";
import { renderSvg } from "./support/qr";
import { rasterizeSvg } from "./support/raster";

const VALUE = "WIFI:T:WPA;S:Cafe Guest;P:sunshine123;;";
const PLAIN: QRProps = {
  value: VALUE,
  size: 1024,
  margin: 4,
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
};

/** The artwork rasterized with the code PIXEL_SCORE_MIN_CODE_WIDTH px wide. */
function pixelsOf(props: QRProps) {
  const size = props.size ?? 1024;
  const artwork = getFrameDimensions(size, props.frame);
  return rasterizeSvg(renderSvg(props), {
    width: Math.round((artwork.width * PIXEL_SCORE_MIN_CODE_WIDTH) / size),
    background: null,
  });
}

const DESIGNS: [string, QRProps][] = [
  ["plain", PLAIN],
  [
    "dots with rounded eyes",
    {
      ...PLAIN,
      bodyPattern: "circle",
      cornerEyePattern: "rounded",
      cornerEyeDotPattern: "circle",
      fgColor: "#1e3a8a",
    },
  ],
  ["low contrast", { ...PLAIN, fgColor: "#9a9a9a", bgColor: "#c8c8c8" }],
  ["inverted", { ...PLAIN, fgColor: "#ffffff", bgColor: "#111111" }],
  ["circle eyes", { ...PLAIN, cornerEyePattern: "circle" }],
  ["no quiet zone", { ...PLAIN, margin: 0 }],
  [
    "framed",
    {
      ...PLAIN,
      frame: { style: "banner-bottom", text: "Scan for Wi-Fi" },
    },
  ],
  ["unreadable", { ...PLAIN, fgColor: "#ffffff", bgColor: "#ffffff" }],
];

describe("getScanScoreFromPixels", () => {
  it("needs no DOM", async () => {
    const result = await getScanScoreFromPixels(PLAIN, pixelsOf(PLAIN));
    expect(result.grade).toBe("great");
    expect(result.checks.find((c) => c.id === "decode-320")?.passed).toBe(true);
  });

  it("rejects pixels that don't match their size", async () => {
    await expect(
      getScanScoreFromPixels(PLAIN, { data: [0, 0, 0], width: 2, height: 2 })
    ).rejects.toThrow(/RGBA/);
  });

  it("counts transparent pixels as white paper", async () => {
    const transparentBackground = { ...PLAIN, bgColor: "transparent" };
    const result = await getScanScoreFromPixels(
      transparentBackground,
      pixelsOf(transparentBackground)
    );
    expect(result.checks.find((c) => c.id === "decode-320")?.passed).toBe(true);
  });

  describe("agrees with the browser score", () => {
    let uninstall: () => void;
    beforeAll(() => {
      uninstall = installFakeDom();
    });
    afterAll(() => uninstall());

    it.each(DESIGNS)("%s", async (_name, props) => {
      const browser = await getScanScore(props);
      const server = await getScanScoreFromPixels(props, pixelsOf(props));
      expect(server.grade).toBe(browser.grade);
      expect(Math.abs(server.score - browser.score)).toBeLessThanOrEqual(10);
      // Everything but decoding is computed from the props alone.
      const staticChecks = (checks: typeof browser.checks) =>
        checks.filter((check) => !check.id.startsWith("decode-"));
      expect(staticChecks(server.checks)).toEqual(staticChecks(browser.checks));
    });
  });
});
