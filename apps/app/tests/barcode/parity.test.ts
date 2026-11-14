// The server draws barcodes with bwip-js's Node build (lib/barcode/server.ts)
// and the generator with its browser build (lib/barcode/render.ts). Both get
// their options from lib/barcode/draw.ts, so for every format and option the
// SVG must be the same string, and the server's raster files must be the
// generator's PNG size, pixel for pixel, and decode as the same value.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  BarcodeDetector,
  type BarcodeFormat as DetectorFormat,
  prepareZXingModule,
} from "barcode-detector/ponyfill";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BARCODE_FORMATS,
  type BarcodeFormatId,
  decodedMatches,
  getBarcodeFormat,
  validateBarcodeInput,
} from "@/lib/barcode/formats";
import { renderBarcodeSVG } from "@/lib/barcode/render";
import { SCAN_CHECK_FORMATS } from "@/lib/barcode/scan-check";
import { renderBarcodeFile, renderBarcodeServer } from "@/lib/barcode/server";
import { type BarcodeStyle, defaultBarcodeStyle } from "@/lib/barcode/style";

(globalThis as { DOMRectReadOnly?: unknown }).DOMRectReadOnly ??= class {
  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly width = 0,
    readonly height = 0,
  ) {}
};

let detector: BarcodeDetector;

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const fromDetector = createRequire(
    require.resolve("barcode-detector/ponyfill"),
  );
  const wasm = readFileSync(
    fromDetector.resolve("zxing-wasm/reader/zxing_reader.wasm"),
  );
  prepareZXingModule({
    overrides: {
      wasmBinary: wasm.buffer.slice(
        wasm.byteOffset,
        wasm.byteOffset + wasm.byteLength,
      ) as ArrayBuffer,
    },
    fireImmediately: true,
  });
  detector = new BarcodeDetector({ formats: SCAN_CHECK_FORMATS });
});

const value = (id: BarcodeFormatId) => {
  const checked = validateBarcodeInput(id, getBarcodeFormat(id).example);
  if (!checked.ok) throw new Error(checked.error);
  return checked.value;
};

/** Each format with its defaults, and with every option changed. */
const variants = (id: BarcodeFormatId): [string, BarcodeStyle][] => {
  const base = defaultBarcodeStyle(id);
  return [
    ["defaults", base],
    [
      "changed",
      {
        foreground: "#1e3a8a",
        background: "#fffbeb",
        showText: false,
        barHeightMm: 10,
        quietZone: getBarcodeFormat(id).quietZone.min,
        scale: 2,
        rotation: 90,
      },
    ],
    ["upside down", { ...base, rotation: 180, scale: 3 }],
    ["turned left", { ...base, rotation: 270 }],
  ];
};

const cases = BARCODE_FORMATS.flatMap((format) =>
  variants(format.id).map(
    ([name, style]) => [format.label, name, format.id, style] as const,
  ),
);

describe("browser and server draw the same SVG", () => {
  it.each(cases)("%s, %s", (_, __, id, style) => {
    const browser = renderBarcodeSVG(id, value(id), style);
    const server = renderBarcodeServer(id, value(id), style);
    expect(server.svg).toBe(browser.svg);
    expect([server.width, server.height]).toEqual([
      browser.width,
      browser.height,
    ]);
  });

  it("rotation turns the drawing a quarter or half", () => {
    const style = defaultBarcodeStyle("code128");
    const upright = renderBarcodeServer("code128", "QRDX", style);
    const turned = renderBarcodeServer("code128", "QRDX", {
      ...style,
      rotation: 90,
    });
    expect([turned.width, turned.height]).toEqual([
      upright.height,
      upright.width,
    ]);
  });
});

async function decode(bytes: Uint8Array) {
  // ZXing reads PNG; JPG, WebP and AVIF are decoded to PNG with sharp first.
  const png = await sharp(bytes).png().toBuffer();
  return detector.detect(
    new Blob([new Uint8Array(png)], { type: "image/png" }),
  );
}

describe("server raster files are the generator's PNG", () => {
  it.each(BARCODE_FORMATS.map((format) => [format.label, format.id] as const))(
    "%s: the browser SVG and the server PNG have the same pixels",
    async (_, id) => {
      const style = defaultBarcodeStyle(id);
      const browser = renderBarcodeSVG(id, value(id), style);
      const file = await renderBarcodeFile(id, value(id), style, "png");
      const server = await sharp(file.body as Uint8Array)
        .raw()
        .toBuffer({ resolveWithObject: true });
      // The browser's SVG rasterized the same way: identical SVG, identical pixels.
      const reference = await sharp(Buffer.from(browser.svg), { density: 72 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([server.info.width, server.info.height]).toEqual([
        browser.width,
        browser.height,
      ]);
      expect(server.data.equals(reference.data)).toBe(true);
    },
  );

  it.each(
    BARCODE_FORMATS.flatMap((format) =>
      (["png", "jpg", "webp", "avif"] as const).map(
        (type) => [format.label, type, format.id] as const,
      ),
    ),
  )("%s as %s decodes as the value drawn", async (_, type, id) => {
    const style = defaultBarcodeStyle(id);
    const file = await renderBarcodeFile(id, value(id), style, type);
    const meta = await sharp(file.body as Uint8Array).metadata();
    expect(meta.format).toBe(
      type === "jpg" ? "jpeg" : type === "avif" ? "heif" : type,
    );
    const found = await decode(file.body as Uint8Array);
    const expected = getBarcodeFormat(id).detectorFormats as readonly string[];
    expect(
      found.some(
        (code) =>
          expected.includes(code.format as DetectorFormat) &&
          decodedMatches(id, value(id), code.rawValue),
      ),
      `decoded ${JSON.stringify(found.map((code) => [code.format, code.rawValue]))}`,
    ).toBe(true);
  });
});

describe("server vector files", () => {
  it.each(BARCODE_FORMATS.map((format) => [format.label, format.id] as const))(
    "%s as SVG, PDF and EPS",
    async (_, id) => {
      const style = defaultBarcodeStyle(id);
      const rendered = renderBarcodeServer(id, value(id), style);

      const svg = await renderBarcodeFile(id, value(id), style, "svg");
      expect(svg.body).toMatch(/^<svg width="[\d.]+mm" height="[\d.]+mm"/);

      const pdf = await renderBarcodeFile(id, value(id), style, "pdf");
      const text = Buffer.from(pdf.body as Uint8Array).toString("latin1");
      expect(text.startsWith("%PDF-1.4")).toBe(true);
      expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
      const box = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text);
      expect(Number(box?.[1])).toBeCloseTo(rendered.widthUnits, 2);
      expect(Number(box?.[2])).toBeCloseTo(rendered.heightUnits, 2);
      // The cross-reference table points at each object.
      const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
      expect(text.slice(startxref, startxref + 4)).toBe("xref");
      for (const match of text
        .slice(startxref)
        .matchAll(/^(\d{10}) 00000 n $/gm)) {
        const offset = Number(match[1]);
        expect(text.slice(offset).match(/^\d+ 0 obj/)).not.toBeNull();
      }

      const eps = await renderBarcodeFile(id, value(id), style, "eps");
      expect(String(eps.body)).toMatch(/^%!PS-Adobe-3\.0 EPSF-3\.0/);
    },
  );

  it("refuses a raster too large to make", async () => {
    await expect(
      renderBarcodeFile(
        "pdf417",
        "x".repeat(900),
        {
          ...defaultBarcodeStyle("pdf417"),
          scale: 10,
          rotation: 0,
        },
        "png",
      ),
    ).resolves.toBeDefined();
    await expect(
      renderBarcodeFile(
        "code128",
        "A".repeat(80),
        {
          ...defaultBarcodeStyle("code128"),
          scale: 10,
        },
        "png",
      ),
    ).rejects.toThrow(/over the 6,000 px limit/);
  });
});
