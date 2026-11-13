// The built-in templates draw their artwork from frame specs
// (src/template/specs). Each must draw what its hand-written template drew
// up to qrdx 0.0.51 (kept unchanged in tests/support/legacy-templates.tsx,
// rendered through `customTemplate`) in every output templates apply to:
// SVG (rasterized), PDF and EPS (both rasterized from their operators), at
// the same size, alone and inside a frame. The canvas component doesn't
// draw templates, so it has nothing to compare.
import { describe, expect, test } from "vitest";
import { getQRAsEPS } from "../src/eps";
import { getQRAsPrintPDFBuffer } from "../src/print";
import { getTemplate } from "../src/templates";
import type { QRProps, TemplateDefinition } from "../types";
import { frameSpecSchema } from "../types/frame-spec";
import { PLAIN, VALUE } from "./support/catalog";
import { compareImages } from "./support/frames";
import {
  LegacyArrow,
  LegacyHalloween,
  LegacySquareBorder,
  LegacyStandardBox,
  LegacyStrikedBox,
} from "./support/legacy-templates";
import { rasterizeEps, rasterizePdf } from "./support/print-raster";
import { renderSvg } from "./support/qr";
import { rasterizeSvg } from "./support/raster";

const TEMPLATES: [string, TemplateDefinition][] = [
  ["Arrow", LegacyArrow],
  ["StandardBox", LegacyStandardBox],
  ["SquareBorder", LegacySquareBorder],
  ["StrikedBox", LegacyStrikedBox],
  ["Halloween", LegacyHalloween],
];

/** Design options each template is drawn with. */
const VARIANTS: [string, Partial<QRProps>][] = [
  ["the default look", {}],
  ["plain shapes", { ...PLAIN }],
  ["brand colors", { fgColor: "#1e3a8a", bgColor: "#fef3c7" }],
  ["a see-through background", { bgColor: "transparent" }],
  [
    "a frame around it",
    { frame: { style: "banner-bottom", text: "Scan me", color: "#be123c" } },
  ],
];

/** Variants printed to PDF and EPS (each print takes a while). */
const PRINTED = new Set(["the default look", "brand colors"]);

function both(id: string, legacy: TemplateDefinition, extra: Partial<QRProps>) {
  const base: QRProps = { value: VALUE, size: 256, level: "M", ...extra };
  return {
    before: { ...base, customTemplate: legacy } as QRProps,
    after: { ...base, templateId: id } as QRProps,
  };
}

const sizeOf = (svg: string) => {
  const match = svg.match(/^<svg[^>]*?\bwidth="([\d.]+)"[^>]*?\bheight="([\d.]+)"/);
  return match ? [Number(match[1]), Number(match[2])] : null;
};

describe.each(TEMPLATES)("%s", (id, legacy) => {
  test("draws a valid frame spec", () => {
    const spec = getTemplate(id)?.spec;
    expect(spec).toBeDefined();
    const result = frameSpecSchema.safeParse(spec);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  test.each(VARIANTS)("rasterizes the same in SVG (%s)", (_name, extra) => {
    const { before, after } = both(id, legacy, extra);
    const a = renderSvg(before);
    const b = renderSvg(after);
    // The same artwork size: the whole template is `size` wide
    expect(sizeOf(b)).toEqual(sizeOf(a));
    const width = Math.round((sizeOf(a)?.[0] ?? 256) * 2);
    const diff = compareImages(
      rasterizeSvg(a, { width }),
      rasterizeSvg(b, { width })
    );
    expect(
      diff.differing,
      `${(diff.differing * 100).toFixed(3)}% of pixels differ`
    ).toBeLessThan(0.001);
    expect(diff.mean).toBeLessThan(0.5);
  });

  test.each(VARIANTS.filter(([name]) => PRINTED.has(name)))(
    "prints the same to PDF and EPS (%s)",
    async (_name, extra) => {
      const { before, after } = both(id, legacy, extra);
      const pdfA = rasterizePdf(
        await getQRAsPrintPDFBuffer(before, { size: 40 }),
        3
      );
      const pdfB = rasterizePdf(
        await getQRAsPrintPDFBuffer(after, { size: 40 }),
        3
      );
      const pdf = compareImages(pdfA.image, pdfB.image);
      expect(
        pdf.differing,
        `PDF: ${(pdf.differing * 100).toFixed(3)}%`
      ).toBeLessThan(0.002);
      const eps = compareImages(
        rasterizeEps(await getQRAsEPS(before, { sizeMm: 40 }), 3).image,
        rasterizeEps(await getQRAsEPS(after, { sizeMm: 40 }), 3).image
      );
      expect(
        eps.differing,
        `EPS: ${(eps.differing * 100).toFixed(3)}%`
      ).toBeLessThan(0.002);
    }
  );
});
