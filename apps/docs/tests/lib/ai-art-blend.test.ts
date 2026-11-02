// The least blend (lib/ai/art-blend.ts) on fake model images made from the
// real control code: grid registration, the correction, the strength search
// and its bounds, and the PNG it delivers. No network, no database.
import {
  type DecodedImage,
  decodePNGPixels,
  getQRFunctionModules,
  scanQRPixels,
} from "qrdx";
import { beforeAll, describe, expect, it } from "vitest";
import {
  correctArt,
  encodePng,
  findLeastBlend,
  LEAST_BLEND_SCAN_SIZES,
  leastBlendBounds,
  locateGrid,
  MIN_GRID_FIT,
  ModuleKind,
  moduleKinds,
  type PixelScan,
} from "@/lib/ai/art-blend";
import {
  type ControlImage,
  controlGrid,
  renderControlImage,
} from "@/lib/ai/art-image";
import { paintedArt, texturedArt } from "../support/ai-art-images";

const TEXT = "https://qrdx.dev/q/Ab3dE9x";

let control: ControlImage;
let textured: DecodedImage;

const pixelsOf = async (png: Uint8Array) => {
  const pixels = await decodePNGPixels(png);
  if (!pixels) throw new Error("unreadable PNG");
  return pixels;
};

/** Mean absolute change per channel, 0–255. */
function meanChange(a: DecodedImage, b: DecodedImage): number {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      sum += Math.abs((a.data[i + c] as number) - (b.data[i + c] as number));
    }
  }
  return sum / ((a.data.length / 4) * 3);
}

beforeAll(async () => {
  control = await renderControlImage(TEXT);
  textured = await pixelsOf(await texturedArt(control.png));
});

describe("module map", () => {
  it("marks the same function modules as the engine, for every version", () => {
    for (let version = 1; version <= 40; version++) {
      const kinds = moduleKinds(version);
      const size = version * 4 + 17;
      const functional = getQRFunctionModules(version);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const isData = kinds[y * size + x] === ModuleKind.data;
          expect(isData, `v${version} (${x}, ${y})`).toBe(!functional[y]?.[x]);
        }
      }
    }
  });

  it("reads the control's modules, with the finders where they belong", () => {
    const { map } = control;
    expect(map.size).toBe(control.modules);
    // A finder: dark outer ring, light ring, dark center, light separator.
    const at = (x: number, y: number) => map.dark[y * map.size + x];
    expect([at(0, 0), at(1, 1), at(3, 3), at(7, 7)]).toEqual([1, 0, 1, 0]);
    expect(map.kinds[0]).toBe(ModuleKind.finder);
  });
});

describe("locateGrid", () => {
  it("finds the control's grid in the control itself", async () => {
    const grid = locateGrid(
      await pixelsOf(control.png),
      control.map,
      controlGrid(control),
    );
    const expected = controlGrid(control);
    expect(grid.fit).toBeGreaterThan(0.95);
    expect(Math.abs(grid.left - expected.left)).toBeLessThan(2);
    expect(Math.abs(grid.pitch / expected.pitch - 1)).toBeLessThan(0.01);
  });

  it("follows a code the model redrew 4% larger and off-center", async () => {
    const moved = await pixelsOf(
      await texturedArt(control.png, { scale: 1.04, shift: [-14, 10] }),
    );
    const expected = controlGrid(control);
    const grid = locateGrid(moved, control.map, expected);
    const size = control.modules * expected.pitch;
    // Where the scaled, shifted code's corner really is
    const left = 512 + (expected.left - 512) * 1.04 - 14;
    const top = 512 + (expected.top - 512) * 1.04 + 10;
    expect(grid.fit).toBeGreaterThan(0.8);
    expect(Math.abs(grid.pitch / expected.pitch - 1.04)).toBeLessThan(0.01);
    expect(Math.abs(grid.left - left)).toBeLessThan(size * 0.01);
    expect(Math.abs(grid.top - top)).toBeLessThan(size * 0.01);
  });
});

describe("correctArt", () => {
  it("leaves the image alone at strength 0 and never edits its input", () => {
    const before = new Uint8Array(textured.data);
    const grid = locateGrid(textured, control.map, controlGrid(control));
    expect(correctArt(textured, control.map, grid, 0).data).toEqual(before);
    correctArt(textured, control.map, grid, 1);
    expect(textured.data).toEqual(before);
  });

  it("changes the image more as the strength grows", () => {
    const grid = locateGrid(textured, control.map, controlGrid(control));
    const changes = [0.05, 0.3, 0.6, 1].map((s) =>
      meanChange(textured, correctArt(textured, control.map, grid, s)),
    );
    for (let i = 1; i < changes.length; i++) {
      expect(changes[i]).toBeGreaterThan(changes[i - 1] as number);
    }
  });

  it("leaves the scene beyond the quiet zone untouched", () => {
    const grid = locateGrid(textured, control.map, controlGrid(control));
    const corrected = correctArt(textured, control.map, grid, 1);
    // The image's corner pixel is far outside the code and its quiet zone.
    expect([...corrected.data.subarray(0, 4)]).toEqual([
      ...textured.data.subarray(0, 4),
    ]);
  });
});

describe("leastBlendBounds", () => {
  it("maps QR visibility onto the search's floor and cap", () => {
    expect(leastBlendBounds(0)).toEqual({
      floor: 0,
      cap: 0.6,
      imageQRFallback: false,
    });
    expect(leastBlendBounds(50)).toEqual({
      floor: 0,
      cap: 1,
      imageQRFallback: true,
    });
    expect(leastBlendBounds(100)).toEqual({
      floor: 0.6,
      cap: 1,
      imageQRFallback: true,
    });
    expect(leastBlendBounds(500)).toEqual(leastBlendBounds(100));
    let previous = leastBlendBounds(0);
    for (let v = 5; v <= 100; v += 5) {
      const bounds = leastBlendBounds(v);
      expect(bounds.floor).toBeGreaterThanOrEqual(previous.floor);
      expect(bounds.cap).toBeGreaterThanOrEqual(previous.cap);
      previous = bounds;
    }
  });
});

describe("findLeastBlend", () => {
  const expectedGrid = () => controlGrid(control);

  /** Passes once the image has changed by at least `threshold` (a monotone stand-in for a scanner). */
  const scanAfterChange =
    (from: DecodedImage, threshold: number, calls: number[]): PixelScan =>
    async (pixels, _text, sizes) => {
      expect(sizes).toEqual(LEAST_BLEND_SCAN_SIZES);
      const change = meanChange(from, pixels);
      calls.push(change);
      return change >= threshold;
    };

  it("returns the lowest strength that passes, to within a bisection step", async () => {
    const grid = locateGrid(textured, control.map, expectedGrid());
    const threshold = meanChange(
      textured,
      correctArt(textured, control.map, grid, 0.42),
    );
    const calls: number[] = [];
    const least = await findLeastBlend({
      pixels: textured,
      text: TEXT,
      map: control.map,
      expected: expectedGrid(),
      bounds: leastBlendBounds(50),
      scan: scanAfterChange(textured, threshold, calls),
    });
    expect(least).not.toBeNull();
    expect(least?.strength).toBeGreaterThanOrEqual(0.42 - 1e-9);
    expect(least?.strength).toBeLessThan(0.42 + 0.03);
    expect(least?.tries).toBe(calls.length);
    expect(
      meanChange(textured, least?.pixels as DecodedImage),
    ).toBeGreaterThanOrEqual(threshold);
  });

  it("stays within the bounds QR visibility sets", async () => {
    const calls: number[] = [];
    // Always passes: a high QR visibility still starts at its floor.
    const least = await findLeastBlend({
      pixels: textured,
      text: TEXT,
      map: control.map,
      expected: expectedGrid(),
      bounds: leastBlendBounds(100),
      scan: scanAfterChange(textured, 0, calls),
    });
    expect(least?.strength).toBe(0.6);

    // Never passes: gives up at the cap, without bisecting.
    const never: number[] = [];
    const none = await findLeastBlend({
      pixels: textured,
      text: TEXT,
      map: control.map,
      expected: expectedGrid(),
      bounds: leastBlendBounds(0),
      scan: scanAfterChange(textured, Number.POSITIVE_INFINITY, never),
    });
    expect(none).toBeNull();
    expect(never.length).toBe(9);
  });

  it("won't paint a code over an image that doesn't follow it", async () => {
    // A scene with none of the code in it.
    const blank = await pixelsOf(await paintedArt(control.png, { keep: 0 }));
    expect(locateGrid(blank, control.map, expectedGrid()).fit).toBeLessThan(
      MIN_GRID_FIT,
    );
    const calls: number[] = [];
    const least = await findLeastBlend({
      pixels: blank,
      text: TEXT,
      map: control.map,
      expected: expectedGrid(),
      bounds: leastBlendBounds(50),
      scan: scanAfterChange(blank, 0, calls),
    });
    expect(least).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("stops at the deadline", async () => {
    const calls: number[] = [];
    const least = await findLeastBlend({
      pixels: textured,
      text: TEXT,
      map: control.map,
      expected: expectedGrid(),
      bounds: leastBlendBounds(50),
      scan: scanAfterChange(textured, Number.POSITIVE_INFINITY, calls),
      deadline: Date.now() - 1,
    });
    expect(least).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("makes a textured image that jsQR can't read scan, with the real scanner", async () => {
    expect((await scanQRPixels(textured, TEXT)).passed).toBe(false);
    const least = await findLeastBlend({
      pixels: textured,
      text: TEXT,
      map: control.map,
      expected: expectedGrid(),
      bounds: leastBlendBounds(50),
    });
    expect(least).not.toBeNull();
    const delivered = await pixelsOf(encodePng(least?.pixels as DecodedImage));
    expect((await scanQRPixels(delivered, TEXT)).passed).toBe(true);
    expect(
      (
        await scanQRPixels(delivered, TEXT, {
          sizes: [...LEAST_BLEND_SCAN_SIZES],
        })
      ).passed,
    ).toBe(true);
    // Less change than forcing every module.
    const full = correctArt(textured, control.map, least?.grid as never, 1);
    expect(meanChange(textured, delivered)).toBeLessThan(
      meanChange(textured, full),
    );
  });

  it("corrects a moved, rescaled code where the model drew it", async () => {
    const moved = await pixelsOf(
      await texturedArt(control.png, {
        scale: 1.04,
        shift: [-14, 10],
        seed: 3,
      }),
    );
    expect((await scanQRPixels(moved, TEXT)).passed).toBe(false);
    const least = await findLeastBlend({
      pixels: moved,
      text: TEXT,
      map: control.map,
      expected: expectedGrid(),
      bounds: leastBlendBounds(50),
    });
    expect(least?.grid.fit).toBeGreaterThan(0.8);
    expect(
      (await scanQRPixels(least?.pixels as DecodedImage, TEXT)).passed,
    ).toBe(true);
  });
});

describe("encodePng", () => {
  it("round-trips the pixels as an opaque RGB PNG", async () => {
    const painted = await pixelsOf(
      await paintedArt(control.png, { keep: 0.75 }),
    );
    const back = await pixelsOf(encodePng(painted));
    expect(back.width).toBe(painted.width);
    expect(back.height).toBe(painted.height);
    for (let i = 0; i < painted.data.length; i += 4) {
      if (
        back.data[i] !== painted.data[i] ||
        back.data[i + 1] !== painted.data[i + 1] ||
        back.data[i + 2] !== painted.data[i + 2] ||
        back.data[i + 3] !== 255
      ) {
        throw new Error(`pixel ${i / 4} differs`);
      }
    }
  });
});
