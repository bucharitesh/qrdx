// Built-in frames written as specs (src/frames/builtin) must draw the same
// artwork as the built-ins in every output: SVG (rasterized), the canvas
// calls, PDF and EPS (both rasterized from their operators). Text isn't
// painted by the test rasterizers, so label geometry is compared as numbers.
import { describe, expect, it } from "vitest";
import { getQRAsEPS } from "../src/eps";
import {
  drawFrameOnCanvas,
  type FrameLabel,
  frameLabels,
  getFrameLayout,
} from "../src/frame";
import { BUILT_IN_FRAME_SPECS } from "../src/frames/builtin";
import { getQRAsPrintPDFBuffer } from "../src/print";
import type { AnyQRFrame, QRProps } from "../types";
import type { FrameStyle } from "../types/frame";
import { frameSpecSchema } from "../types/frame-spec";
import { FRAME_TEXT, PLAIN, recordCanvas, VALUE } from "./support/catalog";
import { compareImages } from "./support/frames";
import { rasterizeEps, rasterizePdf } from "./support/print-raster";
import { renderSvg } from "./support/qr";
import { rasterizeSvg } from "./support/raster";

const STYLES = Object.keys(BUILT_IN_FRAME_SPECS) as FrameStyle[];

const THEMES: [string, Partial<AnyQRFrame>, Partial<QRProps>][] = [
  ["default colors", {}, {}],
  [
    "brand colors",
    { color: "#be123c", textColor: "#fde68a" },
    { fgColor: "#1e3a8a", bgColor: "#fef3c7" },
  ],
];

function pair(style: FrameStyle, frame: Partial<AnyQRFrame> = {}) {
  const spec = BUILT_IN_FRAME_SPECS[style];
  if (!spec) throw new Error(`No spec for ${style}`);
  const builtIn = { style, ...FRAME_TEXT, ...frame } as AnyQRFrame;
  const custom = {
    style: "custom",
    spec,
    ...FRAME_TEXT,
    ...frame,
  } as AnyQRFrame;
  return { builtIn, custom };
}

const close = (a: number, b: number, tolerance = 0.02) =>
  Math.abs(a - b) <= tolerance;

function labelGeometry(label: FrameLabel) {
  return {
    text: label.text,
    x: label.x,
    y: label.y,
    fontSize: label.fontSize,
    maxWidth: label.maxWidth,
    rotate: label.rotate ?? 0,
    color: label.color,
  };
}

describe.each(STYLES)("%s as a spec", (style) => {
  it("validates", () => {
    const result = frameSpecSchema.safeParse(BUILT_IN_FRAME_SPECS[style]);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it.each([160, 256, 1000])(
    "has the built-in's size, code box and labels at %i px",
    (size) => {
      for (const [, frame, props] of THEMES) {
        const { builtIn, custom } = pair(style, frame);
        const a = getFrameLayout(size, builtIn, props.bgColor);
        const b = getFrameLayout(size, custom, props.bgColor);
        expect(close(a.width, b.width)).toBe(true);
        expect(close(a.height, b.height)).toBe(true);
        expect(close(a.qrX, b.qrX)).toBe(true);
        expect(close(a.qrY, b.qrY)).toBe(true);
        expect(b.qrSize).toBe(a.qrSize);
        expect(b.squareEdges).toBe(a.squareEdges);
        expect(b.color).toBe(a.color);
        const la = frameLabels(a).map(labelGeometry);
        const lb = frameLabels(b).map(labelGeometry);
        expect(lb.map((l) => l.text)).toEqual(la.map((l) => l.text));
        lb.forEach((label, i) => {
          const expected = la[i] as (typeof la)[number];
          expect(label.color).toBe(expected.color);
          for (const key of [
            "x",
            "y",
            "fontSize",
            "maxWidth",
            "rotate",
          ] as const) {
            expect(
              close(label[key], expected[key]),
              `${key} of label ${i}: ${label[key]} vs ${expected[key]}`
            ).toBe(true);
          }
        });
      }
    }
  );

  it.each(THEMES)(
    "rasterizes like the built-in in SVG (%s)",
    (_name, frame, props) => {
      const { builtIn, custom } = pair(style, frame);
      const base: QRProps = {
        value: VALUE,
        size: 256,
        level: "M",
        ...PLAIN,
        ...props,
      };
      const layout = getFrameLayout(256, builtIn);
      const width = Math.round(layout.width * 2);
      const a = rasterizeSvg(renderSvg({ ...base, frame: builtIn }), { width });
      const b = rasterizeSvg(renderSvg({ ...base, frame: custom }), { width });
      const diff = compareImages(a, b);
      expect(
        diff.differing,
        `${(diff.differing * 100).toFixed(3)}% of pixels differ`
      ).toBeLessThan(0.001);
      expect(diff.mean).toBeLessThan(0.5);
    }
  );

  it("makes the same canvas calls (one extra fill: the plate)", () => {
    const { builtIn, custom } = pair(style);
    const calls = (frame: AnyQRFrame) => {
      const layout = getFrameLayout(256, frame);
      const { ctx, calls: recorded } = recordCanvas();
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
      return {
        fills: recorded.filter((call) => call === "fill").length,
        shapes: layout.shapes.length,
        texts: recorded.filter((call) => call.startsWith("fillText:")),
      };
    };
    const a = calls(builtIn);
    const b = calls(custom);
    expect(b.fills).toBe(b.shapes);
    expect(b.texts).toEqual(a.texts);
  });

  it.each(THEMES)(
    "prints like the built-in in PDF and EPS (%s)",
    async (_name, frame, props) => {
      const { builtIn, custom } = pair(style, frame);
      const base: QRProps = {
        value: VALUE,
        size: 256,
        level: "M",
        ...PLAIN,
        ...props,
      };
      const pdfA = rasterizePdf(
        await getQRAsPrintPDFBuffer({ ...base, frame: builtIn }, { size: 40 }),
        3
      );
      const pdfB = rasterizePdf(
        await getQRAsPrintPDFBuffer({ ...base, frame: custom }, { size: 40 }),
        3
      );
      const pdf = compareImages(pdfA.image, pdfB.image);
      expect(
        pdf.differing,
        `PDF: ${(pdf.differing * 100).toFixed(3)}%`
      ).toBeLessThan(0.002);
      const epsA = await getQRAsEPS(
        { ...base, frame: builtIn },
        { sizeMm: 40 }
      );
      const epsB = await getQRAsEPS({ ...base, frame: custom }, { sizeMm: 40 });
      const eps = compareImages(
        rasterizeEps(epsA, 3).image,
        rasterizeEps(epsB, 3).image
      );
      expect(
        eps.differing,
        `EPS: ${(eps.differing * 100).toFixed(3)}%`
      ).toBeLessThan(0.002);
      // The same labels
      const shows = (source: string) => source.match(/ show grestore/g)?.length;
      expect(shows(epsB)).toBe(shows(epsA));
    }
  );
});
