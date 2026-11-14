// The /barcode-generator/<format> pages (app/[lang]/(home)/barcode-generator/
// [format]/content.ts): one per symbology, unique titles within the meta
// limits, and download sizes that match what the renderer really draws.
import { describe, expect, it } from "vitest";
import {
  BARCODE_FORMAT_PAGES,
  barcodeFormatPath,
  DOWNLOAD_SIZES_MM,
  getBarcodeFormatPage,
} from "@/app/[lang]/(home)/barcode-generator/[format]/content";
import { MM_PER_UNIT } from "@/lib/barcode/draw";
import {
  BARCODE_FORMATS,
  getBarcodeFormat,
  validateBarcodeInput,
} from "@/lib/barcode/formats";
import { renderBarcodeServer } from "@/lib/barcode/server";
import { defaultBarcodeStyle } from "@/lib/barcode/style";
import { MAX_DESCRIPTION, MAX_TITLE } from "@/lib/seo-overrides";

/** Millimetres as the generator's size line shows them (barcode-generator.tsx). */
const shown = (units: number) =>
  (units * MM_PER_UNIT).toLocaleString("en-US", { maximumFractionDigits: 1 });

describe("barcode format pages", () => {
  it("has one page per format", () => {
    expect(BARCODE_FORMAT_PAGES.map((page) => page.id).sort()).toEqual(
      BARCODE_FORMATS.map((format) => format.id).sort(),
    );
  });

  it("gives each page a unique slug and title within the meta limits", () => {
    const slugs = BARCODE_FORMAT_PAGES.map((page) => page.slug);
    const titles = BARCODE_FORMAT_PAGES.map((page) => page.title);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(titles).size).toBe(titles.length);
    for (const page of BARCODE_FORMAT_PAGES) {
      expect(page.slug).toMatch(/^[a-z0-9-]+$/);
      expect(page.title.length).toBeLessThanOrEqual(MAX_TITLE);
      expect(page.title).toContain(getBarcodeFormat(page.id).label);
      expect(page.metaDescription.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
      expect(page.faqs.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("finds pages by slug and links to them by format", () => {
    expect(getBarcodeFormatPage("ean-13")?.id).toBe("ean13");
    expect(getBarcodeFormatPage("ean13")).toBeUndefined();
    expect(getBarcodeFormatPage("constructor")).toBeUndefined();
    expect(barcodeFormatPath("gs1-128")).toBe("/barcode-generator/gs1-128");
    expect(barcodeFormatPath("datamatrix")).toBe(
      "/barcode-generator/data-matrix",
    );
  });

  it.each(BARCODE_FORMATS.map((format) => format.id))(
    "%s: the stated download size is what the example draws",
    (id) => {
      const checked = validateBarcodeInput(id, getBarcodeFormat(id).example);
      if (!checked.ok) throw new Error(checked.error);
      const drawn = renderBarcodeServer(
        id,
        checked.value,
        defaultBarcodeStyle(id),
      );
      const size = DOWNLOAD_SIZES_MM[id];
      expect(shown(drawn.widthUnits)).toBe(String(size.width));
      expect(shown(drawn.heightUnits)).toBe(String(size.height));
    },
  );
});
