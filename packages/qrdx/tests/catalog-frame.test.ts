// Catalog tests for the styles added after 0.0.46 (split across
// catalog-*.test.ts so Vitest runs them in parallel; shared setup in
// tests/support/catalog.ts). Every new value must decode with jsQR through
// the camera model (contrast loss + ¼-module blur, as scan-score does).
// Frames: decoding, layout, labels, canvas, EPS and PDF.
import { describe, expect, it } from "vitest";
import { svgToEPS } from "../src/eps";
import {
  drawFrameOnCanvas,
  frameLabels,
  getFrameDimensions,
  getFrameLayout,
} from "../src/frame";
import { getQRAsPrintPDFBuffer } from "../src/print";
import type { QRFrame, QRProps } from "../types";
import { FRAME_STYLES, frameSchema } from "../types/frame";
import {
  captureFramed,
  FRAME_TEXT,
  NEW_BODIES,
  NEW_EYES,
  NEW_FRAMES,
  PLAIN,
  recordCanvas,
  VALUE,
} from "./support/catalog";
import { PHONE_MODULE_SIZES, renderSvg } from "./support/qr";

describe("frames", () => {
  it("has at least 12 styles", () => {
    expect(FRAME_STYLES.length).toBeGreaterThanOrEqual(12);
  });

  describe.each(NEW_FRAMES)("%s", (style) => {
    const frame: QRFrame = { style, ...FRAME_TEXT };
    const props: QRProps = { value: VALUE, size: 256, level: "M", frame };

    it("decodes with the default and plain styles", () => {
      for (const extra of [{}, PLAIN]) {
        const failed = PHONE_MODULE_SIZES.filter(
          (px) => captureFramed({ ...props, ...extra }, px) !== VALUE
        );
        expect(failed).toEqual([]);
      }
    });

    it("decodes with every new body pattern and eye", () => {
      for (const bodyPattern of NEW_BODIES) {
        expect(captureFramed({ ...props, bodyPattern }, 6), bodyPattern).toBe(
          VALUE
        );
      }
      for (const cornerEyePattern of NEW_EYES) {
        expect(
          captureFramed({ ...props, cornerEyePattern }, 6),
          cornerEyePattern
        ).toBe(VALUE);
      }
    });

    it("decodes inverted and with brand colors", () => {
      expect(
        captureFramed(
          {
            ...props,
            ...PLAIN,
            margin: 2,
            fgColor: "#ffffff",
            bgColor: "#111827",
            frame: { ...frame, color: "#f59e0b", textColor: "#111827" },
          },
          6
        )
      ).toBe(VALUE);
      expect(
        captureFramed(
          {
            ...props,
            fgColor: "#1e3a8a",
            frame: { ...frame, color: "#be123c" },
          },
          6
        )
      ).toBe(VALUE);
    });

    it("sizes the artwork to its layout and keeps the code whole", () => {
      const layout = getFrameLayout(256, frame);
      expect(getFrameDimensions(256, frame)).toEqual({
        width: layout.width,
        height: layout.height,
      });
      expect(layout.qrX).toBeGreaterThan(0);
      expect(layout.qrY).toBeGreaterThan(0);
      expect(layout.qrX + layout.qrSize).toBeLessThanOrEqual(layout.width);
      expect(layout.qrY + layout.qrSize).toBeLessThanOrEqual(layout.height);
    });

    it("renders its label, honors fontScale and hides an empty label", () => {
      const labels = frameLabels(getFrameLayout(256, frame));
      expect(labels.length).toBeGreaterThan(0);
      const size = (scale: number) =>
        Math.max(
          ...frameLabels(
            getFrameLayout(256, { ...frame, fontScale: scale })
          ).map((l) => l.fontSize)
        );
      expect(size(0.6)).toBeLessThan(size(1));
      expect(size(1.4)).toBeGreaterThanOrEqual(size(1));
      const empty = frameLabels(
        getFrameLayout(256, { style, text: "", secondaryText: "" })
      );
      expect(empty).toEqual([]);
      // Text color and frame color apply
      const colored = frameLabels(
        getFrameLayout(256, {
          ...frame,
          color: "#be123c",
          textColor: "#fde68a",
        })
      );
      expect(colored.every((label) => label.color === "#fde68a")).toBe(true);
    });

    it("draws the same shapes and labels on a canvas", () => {
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
      const fills = calls.filter((call) => call === "fill").length;
      expect(fills).toBe(layout.shapes.length);
      const texts = calls.filter((call) => call.startsWith("fillText:"));
      expect(texts.map((call) => call.slice(9))).toEqual(
        frameLabels(layout).map((label) => label.text)
      );
    });

    it("exports every shape and label to EPS and PDF", async () => {
      const svg = renderSvg({ ...props, ...PLAIN });
      // Only elements every painter supports
      expect(svg).not.toMatch(
        /<(mask|clipPath|use|pattern|filter|image)\b|opacity=/
      );
      const eps = await svgToEPS(svg);
      const labels = frameLabels(getFrameLayout(256, frame));
      expect(eps.match(/ show grestore/g)?.length).toBe(labels.length);
      const rotated = labels.filter((label) => label.rotate).length;
      expect(eps.match(/ rotate \(/g)?.length ?? 0).toBe(rotated);
      expect(eps.match(/\bgsave\b/g)?.length).toBe(
        eps.match(/\bgrestore\b/g)?.length
      );
      expect(eps).not.toMatch(/NaN|Infinity/);
      const pdf = new TextDecoder().decode(
        new Uint8Array(
          await getQRAsPrintPDFBuffer({ ...props, ...PLAIN }, { size: 40 })
        )
      );
      expect(pdf.startsWith("%PDF-")).toBe(true);
    });

    it("validates with the schema", () => {
      expect(frameSchema.safeParse(frame).success).toBe(true);
      expect(frameSchema.safeParse({ ...frame, fontScale: 2 }).success).toBe(
        false
      );
      expect(
        frameSchema.safeParse({ ...frame, secondaryText: "x".repeat(25) })
          .success
      ).toBe(false);
    });
  });

  it("sets curved text on the circle frame, top and bottom", () => {
    const labels = frameLabels(
      getFrameLayout(256, {
        style: "circle",
        text: "SCAN ME",
        secondaryText: "QRDX",
      })
    );
    expect(labels.map((label) => label.text).join("")).toBe("SCANMEQRDX");
    expect(labels.every((label) => typeof label.rotate === "number")).toBe(
      true
    );
  });

  it("steps the gradient border from color to secondaryColor", () => {
    const layout = getFrameLayout(256, {
      style: "gradient-border",
      color: "#000000",
      secondaryColor: "#ffffff",
    });
    // Strips after the inner background, left to right
    const strips = layout.shapes.slice(1);
    const fills = new Set(strips.map((shape) => shape.fill));
    expect(fills.size).toBeGreaterThan(20);
    const level = (fill: string) => Number.parseInt(fill.slice(1, 3), 16);
    expect(level(strips[0]?.fill ?? "")).toBeLessThan(12);
    expect(level(strips.at(-1)?.fill ?? "")).toBeGreaterThan(243);
  });
});
