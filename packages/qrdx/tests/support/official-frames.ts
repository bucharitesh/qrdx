// The checks every official frame (src/frames/official) is held to, split
// into shards so vitest runs them on several workers at once (there are
// hundreds of frames, and each decode check renders and reads dozens of
// images). tests/official-frames/*.test.ts each run one shard.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { getQRAsEPS } from "../../src/eps";
import {
  drawFrameOnCanvas,
  frameLabels,
  getFrameDimensions,
  getFrameLayout,
} from "../../src/frame";
import { OFFICIAL_FRAMES, type OfficialFrame } from "../../src/frames/official";
import { getQRAsPrintPDFBuffer } from "../../src/print";
import {
  getScanScoreFromPixels,
  PIXEL_SCORE_MIN_CODE_WIDTH,
} from "../../src/scan-score";
import { parseColor } from "../../src/utils/parse-color";
import type { AnyQRFrame, QRProps } from "../../types";
import { frameSpecSchema, isLatin1Text } from "../../types/frame-spec";
import { captureFramed, PLAIN, recordCanvas } from "./catalog";
import { compareImages, SAMPLE_PAYLOADS } from "./frames";
import { rasterizeEps, rasterizePdf } from "./print-raster";
import { PHONE_MODULE_SIZES, renderSvg, symbolSize } from "./qr";
import {
  decodeQR,
  type RasterImage,
  rasterizeSvg,
  simulateCamera,
  toPng,
} from "./raster";

/** Shard `index` (1-based) of `count`: every count-th frame. */
export function officialShard(index: number, count: number): OfficialFrame[] {
  return OFFICIAL_FRAMES.filter((_, i) => i % count === index - 1);
}

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
export function blocks(
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

/**
 * Validates, prints Latin-1 labels, names no third-party brand, is
 * monochrome until themed (seasonal frames may be in color but must still
 * follow the theme), keeps the code whole and the labels off it, and draws
 * the same artwork in SVG, canvas, PDF and EPS.
 */
export function describeOfficialFrameChecks(frames: OfficialFrame[]) {
  describe.each(frames.map((frame) => [frame.id, frame] as const))(
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

      test("is monochrome by default (or seasonal) and follows the theme", () => {
        const plain = getFrameLayout(256, frame);
        const colors = [
          ...plain.shapes.map((shape) => shape.fill),
          ...frameLabels(plain).map((label) => label.color),
        ];
        if (official.category !== "seasonal") {
          expect(colors.filter((color) => !isGrey(color))).toEqual([]);
        }
        const themed = getFrameLayout(256, {
          ...frame,
          color: "#be123c",
          textColor: "#fde68a",
          secondaryColor: "#0e7490",
        });
        const themedColors = new Set([
          ...themed.shapes.map((shape) => shape.fill),
          ...frameLabels(themed).map((label) => label.color),
        ]);
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
}

const PAYLOADS = Object.entries(SAMPLE_PAYLOADS);

const ZBAR = (() => {
  const probe = spawnSync("zbarimg", ["--version"], { encoding: "utf8" });
  return probe.status === 0;
})();

function propsFor(frame: AnyQRFrame, value: string, size = 256): QRProps {
  return { value, size, level: "M", frame };
}

/** Renders the code `codeWidth` px wide and decodes it through the camera model. */
function decodesAtWidth(props: QRProps, codeWidth: number): boolean {
  const artwork = getFrameDimensions(codeWidth, props.frame);
  const svg = renderSvg({ ...props, size: codeWidth });
  const modulePx = codeWidth / symbolSize(props.value, props.level);
  const image = rasterizeSvg(svg, {
    width: artwork.width,
    pad: Math.round(codeWidth * 0.12),
  });
  return decodeQR(simulateCamera(image, modulePx)) === props.value;
}

/**
 * Every official frame must scan, the way the theme and frame catalogues are
 * held to it:
 * - jsQR through the camera model (contrast loss + ¼-module blur) at the
 *   phone distances, with a link, a Wi-Fi network and a contact card;
 * - the same at 160 and 320 px code widths (the editor's scan check);
 * - the product's scan score, which must be Great;
 * - zbar on a crisp render, when `zbarimg` is installed.
 */
export function describeOfficialFrameDecoding(frames: OfficialFrame[]) {
  const workDir = ZBAR ? mkdtempSync(join(tmpdir(), "qrdx-frames-")) : "";
  afterAll(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  describe.each(frames.map((frame) => [frame.id, frame] as const))(
    "%s",
    (_id, official) => {
      const frame: AnyQRFrame = { style: "custom", spec: official.spec };

      test("decodes a link, Wi-Fi and a contact at phone distances", () => {
        const failed: string[] = [];
        for (const [name, value] of PAYLOADS) {
          for (const px of PHONE_MODULE_SIZES) {
            if (captureFramed(propsFor(frame, value), px) !== value) {
              failed.push(`${name} at ${px} px/module`);
            }
          }
        }
        for (const px of PHONE_MODULE_SIZES) {
          if (
            captureFramed(
              { ...propsFor(frame, SAMPLE_PAYLOADS.link), ...PLAIN },
              px
            ) !== SAMPLE_PAYLOADS.link
          ) {
            failed.push(`plain modules at ${px} px/module`);
          }
        }
        expect(failed).toEqual([]);
      });

      // The contact card is 53 modules at M, so 160 px is 3 px per module:
      // below the phone-distance floor (4 px, tested above), where every
      // framed code, the built-in frames included, decodes at some widths
      // and not others depending on pixel phase. It must read at 320 px.
      test("decodes at 160 and 320 px wide (the contact card at 320)", () => {
        const failed: string[] = [];
        for (const [name, value] of PAYLOADS) {
          for (const width of name === "vcard" ? [320] : [160, 320]) {
            if (!decodesAtWidth(propsFor(frame, value), width)) {
              failed.push(`${name} at ${width} px`);
            }
          }
        }
        expect(failed).toEqual([]);
      });

      test("scores Great", async () => {
        for (const value of [SAMPLE_PAYLOADS.link, SAMPLE_PAYLOADS.wifi]) {
          const props = propsFor(frame, value, 1024);
          const artwork = getFrameDimensions(1024, frame);
          const pixels = rasterizeSvg(renderSvg(props), {
            width: Math.round(
              (artwork.width * PIXEL_SCORE_MIN_CODE_WIDTH) / 1024
            ),
            background: null,
          });
          const result = await getScanScoreFromPixels(props, pixels);
          expect(
            result.grade,
            `${value}: ${JSON.stringify(result.checks.filter((c) => !c.passed))}`
          ).toBe("great");
        }
      });

      test.skipIf(!ZBAR)("reads with zbar", async () => {
        const failed: string[] = [];
        for (const [name, value] of PAYLOADS) {
          const props = propsFor(frame, value);
          const modules = symbolSize(value, "M");
          const artwork = getFrameDimensions(256, frame);
          const image = rasterizeSvg(renderSvg(props), {
            width: (artwork.width * modules * 6) / 256,
            pad: 24,
          });
          const file = join(workDir, `${official.id}-${name}.png`);
          writeFileSync(file, await toPng(image));
          const result = spawnSync("zbarimg", ["--raw", "-q", file], {
            encoding: "utf8",
          });
          if (result.stdout.replace(/\n$/, "") !== value) {
            failed.push(name);
          }
        }
        expect(failed).toEqual([]);
      });
    }
  );
}
