/** biome-ignore-all lint/style/noMagicNumbers: sample points and tolerances */
// PNG export in plain Node (getQRAsPNG): the bytes decode as a PNG, are the
// size the browser's canvas would draw, and scan back to the encoded value —
// with and without a logo. Colours are sampled for a few styles (gradient,
// frames, shapes). No DOM is involved; the rasterizer is the optional peer
// dependency the export loads on demand.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getQRAsPNG } from "../src/download";
import { getFrameDimensions } from "../src/frame";
import { loadLogoForRasterizer } from "../src/rasterize";
import { decodePng } from "../src/utils/png";
import type { QRProps } from "../types";
import {
  createImage,
  decodeQR,
  type RasterImage,
  toPng,
} from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";

const asImage = async (bytes: Uint8Array): Promise<RasterImage> => {
  const decoded = await decodePng(bytes);
  if (!decoded) {
    throw new Error("the PNG doesn't decode");
  }
  return {
    data: new Uint8ClampedArray(decoded.data),
    width: decoded.width,
    height: decoded.height,
  };
};

const pixelAt = (image: RasterImage, x: number, y: number) => {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]] as const;
};

const centerOf = (image: RasterImage) =>
  pixelAt(image, Math.floor(image.width / 2), Math.floor(image.height / 2));

const isRed = ([r, g, b]: readonly number[]) => r > 200 && g < 80 && b < 80;

const countPixels = (
  image: RasterImage,
  matches: (pixel: readonly number[]) => boolean
) => {
  let count = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    if (matches([image.data[i], image.data[i + 1], image.data[i + 2]])) {
      count++;
    }
  }
  return count;
};

const base64Of = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

describe("getQRAsPNG in Node", () => {
  it("renders a scannable PNG without a browser", async () => {
    const image = await asImage(await getQRAsPNG({ value: VALUE, size: 300 }));
    expect([image.width, image.height]).toEqual([300, 300]);
    expect(decodeQR(image)).toBe(VALUE);
  });

  it("honours the size option", async () => {
    const image = await asImage(
      await getQRAsPNG({ value: VALUE, size: 200 }, { size: 320 })
    );
    expect([image.width, image.height]).toEqual([320, 320]);
  });

  it("sizes a framed code like the browser's canvas does", async () => {
    const props: QRProps = {
      value: VALUE,
      size: 200,
      frame: { style: "banner-bottom", text: "Scan me" },
    };
    const image = await asImage(await getQRAsPNG(props));
    const { width, height } = getFrameDimensions(200, props.frame);
    expect(image.width).toBe(Math.round(width));
    expect(image.height).toBe(Math.round(height));
    expect(decodeQR(image)).toBe(VALUE);
  });

  it("draws a PNG logo like the browser does, and still scans", async () => {
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
    const image = await asImage(await getQRAsPNG(props));
    expect(decodeQR(image)).toBe(VALUE);
    expect(isRed(centerOf(image))).toBe(true);
  });

  it("draws an SVG logo too", async () => {
    const props: QRProps = {
      value: VALUE,
      size: 256,
      level: "H",
      imageSettings: {
        src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='%23ff0000'/%3E%3C/svg%3E",
        width: 52,
        height: 52,
        excavate: true,
      },
    };
    const image = await asImage(await getQRAsPNG(props));
    expect(decodeQR(image)).toBe(VALUE);
    expect(isRed(centerOf(image))).toBe(true);
  });

  it("leaves out a logo it cannot load and still renders", async () => {
    const props: QRProps = {
      value: VALUE,
      size: 200,
      imageSettings: {
        src: "not-a-file.png",
        width: 40,
        height: 40,
        excavate: true,
      },
    };
    const image = await asImage(await getQRAsPNG(props));
    expect(decodeQR(image)).toBe(VALUE);
    expect(isRed(centerOf(image))).toBe(false);
  });

  it("draws circle modules in the requested colour", async () => {
    const image = await asImage(
      await getQRAsPNG({
        value: VALUE,
        size: 300,
        bodyPattern: "circle",
        fgColor: "#ff0000",
      })
    );
    expect(countPixels(image, isRed)).toBeGreaterThan(100);
  });

  it("draws a gradient between its stops", async () => {
    const image = await asImage(
      await getQRAsPNG({
        value: VALUE,
        size: 300,
        fgColor: {
          type: "radial",
          stops: [
            { color: "#000000", offset: 0 },
            { color: "#ff0000", offset: 100 },
          ],
        },
      })
    );
    // Between the two stops: some red, but not the full red of the edge.
    const midTone = ([r, g, b]: readonly number[]) =>
      r > 60 && r < 220 && g < 80 && b < 80;
    expect(countPixels(image, midTone)).toBeGreaterThan(0);
  });

  it("reads a local path in Node and sniffs its type", async () => {
    const logo = await loadLogoForRasterizer(
      fileURLToPath(new URL("./fixtures/art/dog.png", import.meta.url))
    );
    expect(logo?.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("gives up on a data URL it cannot decode", async () => {
    expect(await loadLogoForRasterizer("data:image/png;base64,%%%")).toBeNull();
  });
});

const dist = new URL("../dist/index.mjs", import.meta.url);

describe("browser bundle", () => {
  // The engine is built before the tests in CI and before pushing; without a
  // dist this check simply has nothing to say.
  it.skipIf(!existsSync(dist))(
    "keeps the rasterizers out of the static imports",
    () => {
      const esm = readFileSync(dist, "utf8");
      expect(esm).toMatch(/import\(\s*['"]@resvg\/resvg-js['"]\s*\)/);
      expect(esm).toMatch(/import\(\s*['"]sharp['"]\s*\)/);
      expect(esm).not.toMatch(/from\s*['"](@resvg\/resvg-js|sharp)['"]/);
    }
  );
});
