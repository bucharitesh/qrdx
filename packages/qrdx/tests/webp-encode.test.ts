/** biome-ignore-all lint/style/noMagicNumbers: pixel values and sizes */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: bit fields and a PRNG */
// The lossless WebP encoder that browsers without a WebP canvas encoder
// (Safari) use. libwebp (through sharp) decodes every file it writes, and
// each pixel comes back exactly, alpha included.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  encodeWebPLossless,
  getWebPCompression,
  huffmanLengths,
  isWebPFile,
  WEBP_MAX_DIMENSION,
} from "../src/utils/webp";
import { renderSvg } from "./support/qr";
import { decodeQR, rasterizeSvg } from "./support/raster";

async function decode(file: Uint8Array) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), info };
}

/** A small deterministic generator, so failures repeat. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

async function expectRoundTrip(
  rgba: Uint8Array,
  width: number,
  height: number
) {
  const file = encodeWebPLossless(rgba, width, height);
  expect(isWebPFile(file)).toBe(true);
  expect(getWebPCompression(file)).toBe("lossless");
  const { data, info } = await decode(file);
  expect([info.width, info.height]).toEqual([width, height]);
  expect(Buffer.compare(Buffer.from(data), Buffer.from(rgba))).toBe(0);
  return file;
}

describe("encodeWebPLossless", () => {
  it("writes a RIFF WEBP file with a VP8L chunk of the right size", () => {
    const file = encodeWebPLossless(new Uint8Array(4 * 6).fill(255), 3, 2);
    const ascii = (from: number, to: number) =>
      String.fromCharCode(...file.subarray(from, to));
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 16)).toBe("WEBPVP8L");
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    expect(view.getUint32(4, true)).toBe(file.length - 8);
    const chunk = view.getUint32(16, true);
    expect(file.length).toBe(20 + chunk + (chunk & 1));
    // The VP8L signature, then the size (14 bits each, minus one)
    expect(file[20]).toBe(0x2f);
    const bits = view.getUint32(21, true);
    expect((bits & 0x3f_ff) + 1).toBe(3);
    expect(((bits >>> 14) & 0x3f_ff) + 1).toBe(2);
  });

  it("round-trips a single pixel and a single color", async () => {
    await expectRoundTrip(new Uint8Array([12, 34, 56, 255]), 1, 1);
    await expectRoundTrip(new Uint8Array(4 * 50 * 30).fill(255), 50, 30);
    await expectRoundTrip(new Uint8Array(4 * 7 * 9), 7, 9);
  });

  it("round-trips random pixels with every channel in use", async () => {
    const next = random(7);
    for (const [width, height] of [
      [1, 37],
      [37, 1],
      [17, 23],
      [128, 96],
    ] as const) {
      const rgba = new Uint8Array(width * height * 4);
      for (let index = 0; index < rgba.length; index++) {
        rgba[index] = Math.floor(next() * 256);
      }
      await expectRoundTrip(rgba, width, height);
    }
  });

  it("round-trips skewed histograms, long runs and repeated rows", async () => {
    const next = random(42);
    const width = 300;
    const height = 200;
    const rgba = new Uint8Array(width * height * 4);
    const palette = [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [29, 78, 216, 255],
      [29, 78, 216, 128],
      [0, 0, 0, 0],
    ];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        // Rows repeat in bands; within a row, runs of a few colors; and a
        // rare noisy pixel so the codes get deep, skewed trees.
        const band = Math.floor(y / 9);
        const run = Math.floor((x + band * 13) / (5 + (band % 7)));
        const color =
          next() < 0.002
            ? [next() * 256, next() * 256, next() * 256, next() * 256].map(
                Math.floor
              )
            : (palette[(run + band) % palette.length] as number[]);
        rgba.set(color, offset);
      }
    }
    const file = await expectRoundTrip(rgba, width, height);
    // Far smaller than the raw pixels
    expect(file.length).toBeLessThan(rgba.length / 10);
  });

  it("round-trips gradients that need the longest prefix codes", async () => {
    const width = 256;
    const height = 64;
    const rgba = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Exponentially rarer values push Huffman depths past the limit.
        const level = Math.min(255, Math.floor(2 ** (x / 23)) - 1 + (y % 3));
        rgba.set(
          [level, 255 - level, (x * y) & 0xff, 255],
          (y * width + x) * 4
        );
      }
    }
    await expectRoundTrip(rgba, width, height);
  });

  it("keeps transparent and see-through pixels exactly", async () => {
    const rgba = new Uint8Array([
      0, 0, 0, 0, 255, 0, 0, 128, 0, 0, 0, 255, 255, 255, 255, 1,
    ]);
    await expectRoundTrip(rgba, 2, 2);
  });

  it("encodes a QR code that still scans after decoding", async () => {
    const svg = renderSvg({ value: "https://qrdx.dev/webp", size: 330 });
    const image = rasterizeSvg(svg, { width: 330, height: 330 });
    const rgba = new Uint8Array(image.data);
    const file = await expectRoundTrip(rgba, image.width, image.height);
    const { data } = await decode(file);
    expect(
      decodeQR({
        width: image.width,
        height: image.height,
        data: new Uint8ClampedArray(data),
      })
    ).toBe("https://qrdx.dev/webp");
    // Runs and repeated rows make it smaller than the same pixels as PNG.
    const png = await sharp(Buffer.from(rgba), {
      raw: { width: image.width, height: image.height, channels: 4 },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(file.length).toBeLessThan(png.length);
  });

  it("refuses sizes WebP can't hold", () => {
    expect(() => encodeWebPLossless(new Uint8Array(4), 0, 1)).toThrow(
      RangeError
    );
    expect(() =>
      encodeWebPLossless(new Uint8Array(4), WEBP_MAX_DIMENSION + 1, 1)
    ).toThrow(RangeError);
    expect(() => encodeWebPLossless(new Uint8Array(4), 2, 1)).toThrow(
      /Expected 8 bytes/
    );
  });
});

describe("huffmanLengths", () => {
  it("keeps every length within the limit and the code complete", () => {
    // Fibonacci counts make the deepest possible tree.
    const counts = [1, 1];
    while (counts.length < 40) {
      counts.push((counts.at(-1) as number) + (counts.at(-2) as number));
    }
    for (const limit of [7, 15]) {
      const lengths = huffmanLengths(counts, limit);
      expect(Math.max(...lengths)).toBeLessThanOrEqual(limit);
      const kraft = [...lengths].reduce(
        (sum, length) => sum + (length ? 2 ** -length : 0),
        0
      );
      expect(kraft).toBe(1);
    }
  });

  it("gives a lone symbol length 1 and unused symbols none", () => {
    expect([...huffmanLengths([0, 0, 5, 0], 15)]).toEqual([0, 0, 1, 0]);
    expect([...huffmanLengths([0, 0], 15)]).toEqual([0, 0]);
  });
});

describe("getWebPCompression", () => {
  it("tells lossless from lossy and from other files", async () => {
    const pixels = Buffer.alloc(16 * 16 * 4, 200);
    const raw = { raw: { width: 16, height: 16, channels: 4 as const } };
    const lossy = await sharp(pixels, raw).webp({ quality: 80 }).toBuffer();
    const lossyAlpha = await sharp(
      pixels.map((v, i) => (i % 4 === 3 ? 100 : v)),
      raw
    )
      .webp({ quality: 80 })
      .toBuffer();
    const lossless = await sharp(pixels, raw)
      .webp({ lossless: true })
      .toBuffer();
    const png = await sharp(pixels, raw).png().toBuffer();
    expect(getWebPCompression(new Uint8Array(lossy))).toBe("lossy");
    expect(getWebPCompression(new Uint8Array(lossyAlpha))).toBe("lossy");
    expect(getWebPCompression(new Uint8Array(lossless))).toBe("lossless");
    expect(getWebPCompression(new Uint8Array(png))).toBeNull();
    expect(isWebPFile(new Uint8Array(png))).toBe(false);
  });
});
