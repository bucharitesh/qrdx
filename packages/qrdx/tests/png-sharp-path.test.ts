/** biome-ignore-all lint/style/noMagicNumbers: sample points and tolerances */
// The sharp fallback path. sharp's bundled SVG renderer skips embedded
// <image> elements, so a logo only reaches the pixels through the marker
// render and composite step — the path a CLI user without
// @resvg/resvg-js installed gets. @resvg/resvg-js is mocked away here to
// force that path (the same trick png-no-rasterizer.test.ts uses).

import { describe, expect, it, vi } from "vitest";
import { getQRAsPNG } from "../src/node";
import { decodePng } from "../src/utils/png";
import type { QRProps } from "../types";
import { lightOnTopOfRing } from "./support/dot-ring";
import { createImage, decodeQR, toPng } from "./support/raster";

vi.mock("@resvg/resvg-js", () => {
  throw new Error("Cannot find package '@resvg/resvg-js'");
});

const VALUE = "https://qrdx.dev/q/Sharp1path";

const base64Of = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

describe("getQRAsPNG through sharp", () => {
  it("composites a PNG logo onto the pixels and still scans", async () => {
    const logo = await toPng(createImage(32, 32, "#ff0000"));
    const props: QRProps = {
      value: VALUE,
      size: 256,
      level: "H",
      imageSettings: {
        src: `data:image/png;base64,${base64Of(logo)}`,
        width: 52,
        height: 52,
        excavate: true,
      },
    };
    const bytes = await getQRAsPNG(props);
    const decoded = await decodePng(bytes);
    if (!decoded) {
      throw new Error("the PNG doesn't decode");
    }
    const image = {
      data: new Uint8ClampedArray(decoded.data),
      width: decoded.width,
      height: decoded.height,
    };
    expect(decodeQR(image)).toBe(VALUE);
    // The logo is a red square at the centre of the code.
    const mid =
      (Math.floor(image.height / 2) * image.width +
        Math.floor(image.width / 2)) *
      4;
    expect([image.data[mid], image.data[mid + 1], image.data[mid + 2]]).toEqual(
      [255, 0, 0]
    );
  });

  it("draws the dot ring template and, with a font, its text", async () => {
    const value = "https://example.com/card?id=12345&src=print";
    const bytes = await getQRAsPNG(
      { value, templateId: "DotRing", customProps: { customText: "SCAN ME" } },
      { size: 593 }
    );
    const decoded = await decodePng(bytes);
    if (!decoded) {
      throw new Error("the PNG doesn't decode");
    }
    const image = {
      data: new Uint8ClampedArray(decoded.data),
      width: decoded.width,
      height: decoded.height,
    };
    expect(decodeQR(image)).toBe(value);
    // Text needs a font on the machine, as for frame labels
    const sharp = (await import("sharp")).default;
    const probe = await sharp(
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><text x="4" y="32" font-size="32" font-family="sans-serif">M</text></svg>'
      )
    )
      .raw()
      .toBuffer();
    const hasFonts = probe.some((v, index) => index % 4 === 3 && v > 0);
    if (hasFonts) {
      expect(await lightOnTopOfRing(bytes)).toBeGreaterThan(300);
    }
  });
});
