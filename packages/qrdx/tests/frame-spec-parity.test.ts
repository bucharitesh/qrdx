// Every built-in frame is a frame spec (src/frames/builtin). Each must draw
// what the engine's hand-written layout for that style drew up to 0.0.51
// (kept unchanged in tests/support/legacy-frames.ts), in every output: SVG
// (rasterized), the canvas calls, PDF and EPS (both rasterized from their
// operators), with and without labels, with brand colors and at the
// smallest and largest fontScale. Text isn't painted by the test
// rasterizers, so label geometry is compared as numbers.
import { afterEach, describe, expect, test, vi } from "vitest";
import { getQRAsEPS } from "../src/eps";
import {
  drawFrameOnCanvas,
  type FrameLabel,
  frameLabels,
  getFrameLayout,
} from "../src/frame";
import { BUILT_IN_FRAMES } from "../src/frames/builtin";
import { getQRAsPrintPDFBuffer } from "../src/print";
import type { QRProps } from "../types";
import {
  FRAME_FONT_SCALE_MAX,
  FRAME_FONT_SCALE_MIN,
  FRAME_STYLES,
  type QRFrame,
} from "../types/frame";
import { frameSpecSchema } from "../types/frame-spec";
import { PLAIN, recordCanvas, VALUE } from "./support/catalog";
import { compareImages } from "./support/frames";
import { legacyFrameLayout } from "./support/legacy-frames";
import { rasterizeEps, rasterizePdf } from "./support/print-raster";
import { renderSvg } from "./support/qr";
import { rasterizeSvg } from "./support/raster";

// While `legacy.on` is set, frames named by a style draw the legacy layout
const legacy = vi.hoisted(() => ({ on: false }));
vi.mock("../src/frames/builtin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/frames/builtin")>();
  return {
    ...actual,
    getBuiltInFrameLayout: (
      ...args: Parameters<typeof actual.getBuiltInFrameLayout>
    ) =>
      legacy.on
        ? legacyFrameLayout(...args)
        : actual.getBuiltInFrameLayout(...args),
  };
});

afterEach(() => {
  legacy.on = false;
});

function both<T>(draw: () => T): { before: T; after: T } {
  legacy.on = true;
  try {
    const before = draw();
    legacy.on = false;
    return { before, after: draw() };
  } finally {
    legacy.on = false;
  }
}

async function bothAsync<T>(
  draw: () => Promise<T>
): Promise<{ before: T; after: T }> {
  legacy.on = true;
  try {
    const before = await draw();
    legacy.on = false;
    return { before, after: await draw() };
  } finally {
    legacy.on = false;
  }
}

const STYLES = BUILT_IN_FRAMES.map((frame) => frame.style);

const BRAND: Partial<QRFrame> = {
  color: "#be123c",
  textColor: "#fde68a",
  secondaryColor: "#0f766e",
};

/** Frame options and code props each style is drawn with. */
const VARIANTS: [string, Partial<QRFrame>, Partial<QRProps>][] = [
  ["the default label", {}, {}],
  ["two labels", { text: "Scan me", secondaryText: "qrdx.dev" }, {}],
  ["no labels", { text: "", secondaryText: "" }, {}],
  [
    "brand colors",
    { text: "Order here", secondaryText: "qrdx.dev", ...BRAND },
    { fgColor: "#1e3a8a", bgColor: "#fef3c7" },
  ],
  [
    "the smallest text",
    {
      text: "Scan me",
      secondaryText: "qrdx.dev",
      fontScale: FRAME_FONT_SCALE_MIN,
    },
    {},
  ],
  [
    "the largest text",
    {
      text: "Scan me",
      secondaryText: "qrdx.dev",
      fontScale: FRAME_FONT_SCALE_MAX,
    },
    {},
  ],
  [
    "a long label",
    { text: "Wi-Fi password inside", secondaryText: "Ask the staff" },
    {},
  ],
  ["only a second label", { text: "", secondaryText: "qrdx.dev" }, {}],
];

/**
 * Share of pixels that may differ in SVG. The one style above the default
 * is gradient-border: its old strips were cut at the border and overlapped
 * their neighbor by 0.2% of the width, so the strip left of the cut painted
 * a 0.6 px sliver into the light area along the left inner edge (the left
 * border was a hair thicker than the right). The spec's gradient is clipped
 * to the ring, so that sliver is gone; every differing pixel is on that
 * edge.
 */
const SVG_TOLERANCE: Partial<Record<string, number>> = {
  "gradient-border": 0.004,
};

/** The variants printed to PDF and EPS (each print takes a while). */
const PRINTED = new Set([
  "two labels",
  "no labels",
  "brand colors",
  "the largest text",
]);

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
    color: label.color.toLowerCase(),
    field: label.field,
  };
}

const props = (
  style: string,
  frame: Partial<QRFrame>,
  extra: Partial<QRProps>
): QRProps => ({
  value: VALUE,
  size: 256,
  level: "M",
  ...PLAIN,
  ...extra,
  frame: { style, ...frame } as QRFrame,
});

test("every built-in style is a spec in the catalogue", () => {
  expect([...STYLES].sort()).toEqual(
    FRAME_STYLES.filter((style) => style !== "none").sort()
  );
  for (const { style, spec } of BUILT_IN_FRAMES) {
    const result = frameSpecSchema.safeParse(spec);
    expect(result.error?.issues ?? [], style).toEqual([]);
  }
});

describe.each(STYLES)("%s", (style) => {
  test.each([160, 256, 1000])(
    "has the same size, code box and labels at %i px",
    (size) => {
      for (const [name, frame, extra] of VARIANTS) {
        const options = { style, ...frame } as QRFrame;
        const { before: a, after: b } = both(() =>
          getFrameLayout(size, options, extra.bgColor)
        );
        const where = `${name}: `;
        expect(close(a.width, b.width), `${where}width`).toBe(true);
        expect(close(a.height, b.height), `${where}height`).toBe(true);
        expect(close(a.qrX, b.qrX), `${where}qrX`).toBe(true);
        expect(close(a.qrY, b.qrY), `${where}qrY`).toBe(true);
        expect(b.qrSize).toBe(a.qrSize);
        expect(b.squareEdges, `${where}squareEdges`).toBe(a.squareEdges);
        expect(b.color.toLowerCase(), `${where}color`).toBe(
          a.color.toLowerCase()
        );
        const la = frameLabels(a).map(labelGeometry);
        const lb = frameLabels(b).map(labelGeometry);
        expect(
          lb.map((l) => `${l.field}:${l.text}`),
          `${where}labels`
        ).toEqual(la.map((l) => `${l.field}:${l.text}`));
        lb.forEach((label, i) => {
          const expected = la[i] as (typeof la)[number];
          expect(label.color, `${where}color of label ${i}`).toBe(
            expected.color
          );
          for (const key of [
            "x",
            "y",
            "fontSize",
            "maxWidth",
            "rotate",
          ] as const) {
            expect(
              close(label[key], expected[key]),
              `${where}${key} of label ${i}: ${label[key]} vs ${expected[key]}`
            ).toBe(true);
          }
        });
      }
    }
  );

  test.each(VARIANTS)(
    "rasterizes the same in SVG (%s)",
    (_name, frame, extra) => {
      const options = props(style, frame, extra);
      const width = Math.round(
        getFrameLayout(256, options.frame as QRFrame).width * 2
      );
      const { before, after } = both(() =>
        rasterizeSvg(renderSvg(options), { width })
      );
      const diff = compareImages(before, after);
      expect(
        diff.differing,
        `${(diff.differing * 100).toFixed(3)}% of pixels differ`
      ).toBeLessThan(SVG_TOLERANCE[style] ?? 0.001);
      expect(diff.mean).toBeLessThan(0.5);
    }
  );

  test("keeps a see-through background, or paints an opaque plate", () => {
    const { spec } = BUILT_IN_FRAMES.find((item) => item.style === style)!;
    const options = props(
      style,
      { text: "Scan me", secondaryText: "qrdx.dev" },
      { bgColor: "transparent" }
    );
    if (spec.qr.plate === "background") {
      // As before: nothing of the frame lies under the code, so the light
      // area stays see-through
      const width = Math.round(
        getFrameLayout(256, options.frame as QRFrame).width * 2
      );
      const { before, after } = both(() =>
        rasterizeSvg(renderSvg(options), { width })
      );
      expect(compareImages(before, after).differing).toBeLessThan(
        SVG_TOLERANCE[style] ?? 0.001
      );
      // Down to the markup (but the gradient's strips, and the circle's two
      // dots, which were one path and are two shapes now)
      if (!["gradient-border", "circle"].includes(style)) {
        const markup = both(() => renderSvg(options));
        expect(markup.after).toBe(markup.before);
      }
      return;
    }
    // The frame lies under the code: the old layout showed it through a
    // see-through background (the code sat on the frame color); the spec
    // paints a white plate under the code instead
    const layout = getFrameLayout(256, options.frame as QRFrame, "transparent");
    const plate = layout.shapes.find(
      (shape) =>
        shape.type === "rect" &&
        !shape.hole &&
        Math.abs(shape.x - (layout.qrX - (spec.qr.padding ?? 0) * 0.256)) < 0.01
    );
    expect(plate?.fill).toBe("#FFFFFF");
  });

  test.each(VARIANTS)(
    "makes the same canvas text calls (%s)",
    (_name, frame, extra) => {
      const options = { style, ...frame } as QRFrame;
      const draw = () => {
        const layout = getFrameLayout(256, options, extra.bgColor);
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
        return {
          fills: calls.filter((call) => call === "fill").length,
          shapes: layout.shapes.length,
          // Font sizes rounded past float noise
          texts: calls
            .filter(
              (call) => call.startsWith("fillText:") || call.startsWith("font=")
            )
            .map((call) =>
              call.replace(/\d+\.\d+(?=px)/, (px) =>
                String(Math.round(Number(px) * 1e6) / 1e6)
              )
            ),
        };
      };
      const { before, after } = both(draw);
      expect(after.fills).toBe(after.shapes);
      expect(after.texts).toEqual(before.texts);
    }
  );

  test.each(VARIANTS.filter(([name]) => PRINTED.has(name)))(
    "prints the same to PDF and EPS (%s)",
    async (_name, frame, extra) => {
      const options = props(style, frame, extra);
      const pdf = await bothAsync(async () =>
        rasterizePdf(await getQRAsPrintPDFBuffer(options, { size: 40 }), 3)
      );
      const pdfDiff = compareImages(pdf.before.image, pdf.after.image);
      expect(
        pdfDiff.differing,
        `PDF: ${(pdfDiff.differing * 100).toFixed(3)}%`
      ).toBeLessThan(0.002);
      const eps = await bothAsync(() => getQRAsEPS(options, { sizeMm: 40 }));
      const epsDiff = compareImages(
        rasterizeEps(eps.before, 3).image,
        rasterizeEps(eps.after, 3).image
      );
      expect(
        epsDiff.differing,
        `EPS: ${(epsDiff.differing * 100).toFixed(3)}%`
      ).toBeLessThan(0.002);
      // The same labels
      const shows = (source: string) =>
        source.match(/ show grestore/g)?.length ?? 0;
      expect(shows(eps.after)).toBe(shows(eps.before));
    }
  );
});
