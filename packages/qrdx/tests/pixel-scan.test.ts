// scanQRPixels and decodePNGPixels run without a DOM, as servers use them:
// codes are rendered by the real <QRCodeSVG>, rasterized by the test
// rasterizer and round-tripped through PNG bytes.
import { describe, expect, it } from "vitest";
import { decodePNGPixels, scanQRPixels } from "../src/index";
import type { QRProps } from "../types";
import { renderSvg } from "./support/qr";
import { rasterizeSvg, toPng } from "./support/raster";

const VALUE = "https://qrdx.dev/q/Ab3dE9x";
const PLAIN: QRProps = {
  value: VALUE,
  size: 512,
  margin: 4,
  level: "H",
  bodyPattern: "square",
  cornerEyePattern: "square",
  cornerEyeDotPattern: "square",
};

const pixelsOf = (props: QRProps, width = 512) =>
  rasterizeSvg(renderSvg(props), { width });

describe("scanQRPixels", () => {
  it("passes a plain code that decodes to the expected value", async () => {
    const result = await scanQRPixels(pixelsOf(PLAIN), VALUE);
    expect(result).toMatchObject({ data: VALUE, passed: true });
    expect(result.version).toBeGreaterThan(0);
  });

  it("fails a code that decodes to something else, and says what", async () => {
    const result = await scanQRPixels(pixelsOf(PLAIN), "https://example.com");
    expect(result).toMatchObject({ data: VALUE, passed: false });
  });

  it("fails pixels without a code", async () => {
    const blank = pixelsOf({ ...PLAIN, fgColor: "#ffffff" });
    expect(await scanQRPixels(blank, VALUE)).toEqual({
      data: null,
      version: null,
      passed: false,
    });
  });

  it("fails light-on-dark codes, which many scanner apps can't read", async () => {
    const inverted = pixelsOf({
      ...PLAIN,
      fgColor: "#ffffff",
      bgColor: "#000000",
    });
    expect((await scanQRPixels(inverted, VALUE)).passed).toBe(false);
  });

  it("checks every requested camera size", async () => {
    // A 1 px-per-module render can't survive the camera model at 320 px.
    const tiny = pixelsOf(PLAIN, 41);
    const plain = await scanQRPixels(tiny, VALUE, { sizes: [] });
    expect(plain.passed).toBe(true);
    const camera = await scanQRPixels(tiny, VALUE, { sizes: [24] });
    expect(camera.passed).toBe(false);
  });

  it("rejects pixel buffers that are too short", async () => {
    await expect(
      scanQRPixels({ data: new Uint8Array(4), width: 2, height: 2 }, VALUE)
    ).rejects.toThrow(/RGBA/);
  });
});

describe("decodePNGPixels", () => {
  it("reads PNG bytes back into the same RGBA pixels", async () => {
    const image = pixelsOf(PLAIN, 256);
    const decoded = await decodePNGPixels(await toPng(image));
    expect(decoded).not.toBeNull();
    expect(decoded?.width).toBe(image.width);
    expect(decoded?.height).toBe(image.height);
    expect(Array.from(decoded?.data ?? []).slice(0, 4096)).toEqual(
      Array.from(image.data).slice(0, 4096)
    );
    expect((await scanQRPixels(decoded!, VALUE)).passed).toBe(true);
  });

  it("returns null for bytes that aren't a PNG", async () => {
    expect(await decodePNGPixels(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
