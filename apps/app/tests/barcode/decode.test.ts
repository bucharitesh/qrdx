// Every barcode the generator draws must scan. Each format is rendered
// (lib/barcode/render.ts), rasterized from its SVG with sharp and decoded
// with the scanner's own reader: the `barcode-detector` ponyfill that
// components/scanner/detector.ts and the generator's scan check use (ZXing
// compiled to WebAssembly), loaded here from the local package instead of
// the CDN. The coupon block's own encoder (lib/landing/blocks/coupon-barcode.tsx)
// is decoded the same way.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  BarcodeDetector,
  type BarcodeFormat as DetectorFormat,
  prepareZXingModule,
} from "barcode-detector/ponyfill";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BARCODE_FORMATS,
  type BarcodeFormatId,
  decodedMatches,
  getBarcodeFormat,
  validateBarcodeInput,
} from "@/lib/barcode/formats";
import { type BarcodeStyle, renderBarcodeSVG } from "@/lib/barcode/render";
import { SCAN_CHECK_FORMATS } from "@/lib/barcode/scan-check";
import { Barcode as CouponBarcode } from "@/lib/landing/blocks/coupon-barcode";

// The ponyfill builds a DOMRectReadOnly for each result's bounding box; Node
// has none. Decoding doesn't touch it.
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

async function decodeSvg(svg: string, density = 72) {
  const png = await sharp(Buffer.from(svg), { density })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  return detector.detect(
    new Blob([new Uint8Array(png)], { type: "image/png" }),
  );
}

const BASE: BarcodeStyle = {
  foreground: "#000000",
  background: "#ffffff",
  showText: true,
  barHeightMm: 15,
  quietZone: 10,
  scale: 3,
};

/** Values beyond each format's example: long, short and edge cases. */
const EXTRA_VALUES: Partial<Record<BarcodeFormatId, string[]>> = {
  ean13: ["400638133393", "978030640615"],
  ean8: ["9638507"],
  upca: ["01234500005"],
  upce: ["654321", "01234558", "065100004327"],
  code128: ["12345678", "abc DEF 123 !#%", "QRDX 0042-ALPHA/beta"],
  code39: ["ABC-123 $/+%."],
  itf14: ["1001234567890"],
  "gs1-128": [
    "(00)10614141123456789",
    "(01)09501101530003(10)LOT-7(17)261231",
    "(01)09501101530003(3103)000123",
  ],
  datamatrix: ["héllo ✓ 日本", "A".repeat(300)],
  pdf417: ["Line one\nLine two", "1234567890".repeat(20)],
  aztec: ["héllo ✓", "https://qrdx.dev/barcode-generator?x=1"],
};

const cases = BARCODE_FORMATS.flatMap((format) =>
  [format.example, ...(EXTRA_VALUES[format.id] ?? [])].map(
    (raw) => [format.label, raw, format.id] as const,
  ),
);

describe("generated barcodes decode with the scanner's reader", () => {
  it.each(cases)("%s %j", async (_, raw, id) => {
    const checked = validateBarcodeInput(id, raw);
    if (!checked.ok) throw new Error(checked.error);
    const { svg } = renderBarcodeSVG(id, checked.value, BASE);
    const found = await decodeSvg(svg);
    const expected = getBarcodeFormat(id).detectorFormats as readonly string[];
    const match = found.find(
      (code) =>
        expected.includes(code.format) &&
        decodedMatches(id, checked.value, code.rawValue),
    );
    expect(
      match,
      `decoded ${JSON.stringify(found.map((code) => [code.format, code.rawValue]))}`,
    ).toBeDefined();
  });

  it.each(BARCODE_FORMATS.map((format) => [format.label, format.id] as const))(
    "%s with the options changed: no text, minimum quiet zone, dark blue on cream, small PNG",
    async (_, id) => {
      const format = getBarcodeFormat(id);
      const checked = validateBarcodeInput(id, format.example);
      if (!checked.ok) throw new Error(checked.error);
      const { svg } = renderBarcodeSVG(id, checked.value, {
        foreground: "#1e3a8a",
        background: "#fffbeb",
        showText: false,
        barHeightMm: 10,
        quietZone: format.quietZone.min,
        scale: 2,
      });
      const found = await decodeSvg(svg);
      expect(
        found.some((code) => decodedMatches(id, checked.value, code.rawValue)),
        `decoded ${JSON.stringify(found.map((code) => code.rawValue))}`,
      ).toBe(true);
    },
  );
});

describe("coupon block barcodes decode with the same reader", () => {
  it.each([
    ["ean13", "590123412345", "5901234123457", "ean_13"],
    ["code128", "SAVE20", "SAVE20", "code_128"],
    ["code128", "QRDX-2026-0042", "QRDX-2026-0042", "code_128"],
  ] as const)("%s %s", async (format, value, decoded, detected) => {
    const svg = renderToStaticMarkup(
      createElement(CouponBarcode, { format, value }),
    );
    const found = await decodeSvg(svg, 72 * 4);
    expect(
      found.map((code) => [code.format, code.rawValue] as const),
    ).toContainEqual([detected, decoded]);
  });
});

describe("SCAN_CHECK_FORMATS", () => {
  it("covers every format's reader names", () => {
    for (const format of BARCODE_FORMATS) {
      for (const name of format.detectorFormats) {
        expect(SCAN_CHECK_FORMATS).toContain(name as DetectorFormat);
      }
    }
  });
});
