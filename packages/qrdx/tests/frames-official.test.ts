// The official frame catalogue (src/frames/official): 24 specs that ship
// with the engine. Each must validate, print its labels (Latin-1), avoid
// third-party marks, be monochrome until themed, and draw the same artwork
// in SVG, canvas, PDF and EPS. Scanning is covered in
// decode-official-frames.test.ts.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";
import { getQRAsEPS } from "../src/eps";
import { drawFrameOnCanvas, frameLabels, getFrameLayout } from "../src/frame";
import { getOfficialFrame, OFFICIAL_FRAMES } from "../src/frames/official";
import { getQRAsPrintPDFBuffer } from "../src/print";
import { parseColor } from "../src/utils/parse-color";
import type { AnyQRFrame, QRProps } from "../types";
import { frameSpecSchema, isLatin1Text } from "../types/frame-spec";
import { PLAIN, recordCanvas } from "./support/catalog";
import { compareImages, SAMPLE_PAYLOADS } from "./support/frames";
import { rasterizeEps, rasterizePdf } from "./support/print-raster";
import { renderSvg } from "./support/qr";
import { type RasterImage, rasterizeSvg } from "./support/raster";

const BRANDS =
  /\b(paypal|venmo|upi|google|apple|iphone|ios|android|instagram|facebook|tiktok|whatsapp|twitter|linkedin|youtube|spotify|visa|mastercard)\b/i;

const isGrey = (color: string) => {
  const parsed = parseColor(color);
  return Boolean(parsed && parsed.r === parsed.g && parsed.g === parsed.b);
};

/**
 * The top-left `width` × `height` of an image, averaged over `block` ×
 * `block` pixels: different renderers at slightly different scales put
 * edges a fraction of a pixel apart, which this absorbs, while a missing or
 * moved shape (an icon is 40+ px here) still shows.
 */
function blocks(
  image: RasterImage,
  width: number,
  height: number,
  block = 4
): RasterImage {
  const w = Math.floor(width / block);
  const h = Math.floor(height / block);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < block; dy++) {
          for (let dx = 0; dx < block; dx++) {
            sum += image.data[
              ((y * block + dy) * image.width + x * block + dx) * 4 + c
            ] as number;
          }
        }
        data[(y * w + x) * 4 + c] = sum / (block * block);
      }
    }
  }
  return { data, width: w, height: h };
}

describe("the official frame catalogue", () => {
  it("has 20 use-case frames and 4 seasonal ones, one file each", () => {
    expect(OFFICIAL_FRAMES).toHaveLength(24);
    expect(
      OFFICIAL_FRAMES.filter((f) => f.category === "use-case")
    ).toHaveLength(20);
    expect(
      OFFICIAL_FRAMES.filter((f) => f.category === "seasonal")
    ).toHaveLength(4);
    const files = readdirSync(join(__dirname, "../src/frames/official"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/, ""))
      .sort();
    expect(OFFICIAL_FRAMES.map((f) => f.id).sort()).toEqual(files);
    expect(new Set(OFFICIAL_FRAMES.map((f) => f.name)).size).toBe(24);
    expect(getOfficialFrame("wifi-card")?.name).toBe("Wi-Fi card");
    expect(getOfficialFrame("nope")).toBeUndefined();
  });

  it("compares outputs closely enough to catch a missing glyph", () => {
    // Negative control for the PDF/EPS comparison below
    const official = getOfficialFrame("wifi-card");
    if (!official) throw new Error("missing wifi-card");
    const without = {
      ...official.spec,
      shapes: official.spec.shapes.filter((shape) => shape.type !== "icon"),
    };
    const draw = (spec: typeof without) =>
      rasterizeSvg(
        renderSvg({
          value: SAMPLE_PAYLOADS.link,
          size: 256,
          level: "M",
          frame: { style: "custom", spec },
        }),
        { width: 600 }
      );
    const a = draw(official.spec);
    const b = draw(without);
    const diff = compareImages(
      blocks(a, a.width, a.height),
      blocks(b, b.width, b.height),
      64
    );
    expect(diff.differing).toBeGreaterThan(0.002);
  });

  it("is CC0 and described without placeholders", () => {
    for (const frame of OFFICIAL_FRAMES) {
      expect(frame.license).toBe("CC0-1.0");
      expect(frame.description.length).toBeGreaterThan(20);
      expect(`${frame.name} ${frame.description}`).not.toMatch(
        /TBD|TODO|lorem|\[\[/i
      );
    }
  });
});

describe.each(OFFICIAL_FRAMES.map((frame) => [frame.id, frame] as const))(
  "%s",
  (_id, official) => {
    const frame: AnyQRFrame = { style: "custom", spec: official.spec };
    const props: QRProps = {
      value: SAMPLE_PAYLOADS.link,
      size: 256,
      level: "M",
      ...PLAIN,
      frame,
    };

    test("validates, with Latin-1 labels and no brand names", () => {
      const result = frameSpecSchema.safeParse(official.spec);
      expect(result.error?.issues ?? []).toEqual([]);
      const texts = official.spec.labels.map((label) => label.text);
      expect(texts.every(isLatin1Text)).toBe(true);
      expect(
        `${official.name} ${official.description} ${texts.join(" ")}`
      ).not.toMatch(BRANDS);
      expect(
        official.spec.labels.some((label) => label.slot === "primary")
      ).toBe(true);
    });

    test("is monochrome by default and follows the theme", () => {
      const plain = getFrameLayout(256, frame);
      const colors = [
        ...plain.shapes.map((shape) => shape.fill),
        ...frameLabels(plain).map((label) => label.color),
      ];
      expect(colors.filter((color) => !isGrey(color))).toEqual([]);
      const themed = getFrameLayout(256, {
        ...frame,
        color: "#be123c",
        textColor: "#fde68a",
        secondaryColor: "#0e7490",
      });
      const themedColors = new Set(themed.shapes.map((shape) => shape.fill));
      expect([...themedColors].some((color) => !isGrey(color))).toBe(true);
    });

    test("keeps the code whole and the labels off it", () => {
      const layout = getFrameLayout(256, frame);
      expect(layout.qrSize).toBe(256);
      expect(layout.qrX + layout.qrSize).toBeLessThanOrEqual(
        layout.width + 1e-9
      );
      expect(layout.qrY + layout.qrSize).toBeLessThanOrEqual(
        layout.height + 1e-9
      );
      // The last shape is the plate under the code
      const plate = layout.shapes.at(-1);
      expect(plate?.type).toBe("rect");
      if (plate?.type === "rect") {
        expect(plate.x).toBeLessThan(layout.qrX);
        expect(plate.x + plate.width).toBeGreaterThan(layout.qrX + 256);
      }
      // Frame shapes come before the code, labels after: nothing else on top
      const svg = renderSvg(props);
      const codeStart = svg.indexOf("<svg", 1);
      const after = svg.slice(svg.indexOf("</svg>", codeStart) + 6);
      expect(after).not.toMatch(/<(rect|path|polygon)\b/);
      expect(svg).not.toMatch(
        /<(mask|clipPath|use|pattern|filter|image)\b|opacity=/
      );
    });

    test("draws the same shapes and labels on a canvas", () => {
      const layout = getFrameLayout(256, frame);
      const { ctx, calls } = recordCanvas();
      const previous = (globalThis as Record<string, unknown>).Path2D;
      (globalThis as Record<string, unknown>).Path2D = class {
        readonly d: string;
        constructor(d: string) {
          this.d = d;
        }
      };
      try {
        drawFrameOnCanvas(ctx, layout);
      } finally {
        (globalThis as Record<string, unknown>).Path2D = previous;
      }
      expect(calls.filter((call) => call === "fill")).toHaveLength(
        layout.shapes.length
      );
      expect(
        calls
          .filter((call) => call.startsWith("fillText:"))
          .map((call) => call.slice(9))
      ).toEqual(frameLabels(layout).map((label) => label.text));
    });

    test("prints the same artwork in PDF and EPS as in SVG", async () => {
      const layout = getFrameLayout(256, frame);
      const labels = frameLabels(layout);
      const eps = await getQRAsEPS(props, { sizeMm: 40 });
      expect(eps.match(/ show grestore/g)?.length ?? 0).toBe(labels.length);
      expect(eps.match(/\bgsave\b/g)?.length).toBe(
        eps.match(/\bgrestore\b/g)?.length
      );
      expect(eps).not.toMatch(/NaN|Infinity/);
      const pdfBuffer = await getQRAsPrintPDFBuffer(props, { size: 40 });
      const pdf = rasterizePdf(pdfBuffer, 3);
      const epsImage = rasterizeEps(eps, 3).image;
      const svg = rasterizeSvg(renderSvg(props), { width: pdf.image.width });
      const width = Math.min(pdf.image.width, epsImage.width, svg.width);
      const height = Math.min(pdf.image.height, epsImage.height, svg.height);
      const reference = blocks(svg, width, height);
      const pdfDiff = compareImages(
        reference,
        blocks(pdf.image, width, height),
        64
      );
      const epsDiff = compareImages(
        reference,
        blocks(epsImage, width, height),
        64
      );
      expect(
        pdfDiff.differing,
        `PDF: ${(pdfDiff.differing * 100).toFixed(3)}%, mean ${pdfDiff.mean.toFixed(2)}`
      ).toBeLessThan(0.002);
      expect(
        epsDiff.differing,
        `EPS: ${(epsDiff.differing * 100).toFixed(3)}%, mean ${epsDiff.mean.toFixed(2)}`
      ).toBeLessThan(0.002);
    });
  }
);
