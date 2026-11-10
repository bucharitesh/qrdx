// The barcode generator's SVG output (lib/barcode/render.ts, bwip-js), its
// color checks, and the rule that bwip-js loads only on /barcode-generator.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SCAN_CONTRAST_FAIL, SCAN_CONTRAST_LOW, SCAN_CONTRAST_MIN } from "qrdx";
import { describe, expect, it } from "vitest";
import { BARCODE_CONTRAST, barcodeColorWarnings } from "@/lib/barcode/colors";
import { BARCODE_FORMATS, validateBarcodeInput } from "@/lib/barcode/formats";
import {
  type BarcodeStyle,
  encoderMessage,
  MODULE_UNITS,
  printableSVG,
  renderBarcodeSVG,
} from "@/lib/barcode/render";

const app = path.resolve(import.meta.dirname, "../..");

const STYLE: BarcodeStyle = {
  foreground: "#000000",
  background: "#ffffff",
  showText: true,
  barHeightMm: 15,
  quietZone: 10,
  scale: 2,
};

function checkedValue(id: (typeof BARCODE_FORMATS)[number]["id"], raw: string) {
  const checked = validateBarcodeInput(id, raw);
  if (!checked.ok) throw new Error(checked.error);
  return checked.value;
}

describe("renderBarcodeSVG", () => {
  it.each(BARCODE_FORMATS.map((format) => [format.label, format] as const))(
    "draws %s as SVG with its size and colors",
    (_, format) => {
      const rendered = renderBarcodeSVG(
        format.id,
        checkedValue(format.id, format.example),
        {
          ...STYLE,
          foreground: "#1d3a8a",
          background: "#fafaf0",
        },
      );
      expect(rendered.svg).toMatch(/^<svg width="[\d.]+" height="[\d.]+" /);
      expect(rendered.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(rendered.svg).toContain("#1d3a8a");
      expect(rendered.svg).toContain("#fafaf0");
      expect(rendered.svg).not.toContain("#000000");
      expect(rendered.width).toBeGreaterThan(0);
      expect(rendered.widthUnits).toBe(rendered.width / STYLE.scale);
    },
  );

  it("adds the quiet zone in modules on each side", () => {
    for (const format of BARCODE_FORMATS) {
      const value = checkedValue(format.id, format.example);
      const none = renderBarcodeSVG(format.id, value, {
        ...STYLE,
        quietZone: 0,
      });
      const five = renderBarcodeSVG(format.id, value, {
        ...STYLE,
        quietZone: 5,
      });
      expect(five.widthUnits - none.widthUnits).toBe(
        2 * 5 * MODULE_UNITS[format.id],
      );
    }
  });

  it("sets the bar height in millimetres and hides the text on request", () => {
    const value = checkedValue("code128", "QRDX-1");
    const short = renderBarcodeSVG("code128", value, {
      ...STYLE,
      showText: false,
      barHeightMm: 10,
      quietZone: 0,
    });
    const tall = renderBarcodeSVG("code128", value, {
      ...STYLE,
      showText: false,
      barHeightMm: 20,
      quietZone: 0,
    });
    // One unit is one point: 10 mm more is 28.35 points more.
    expect(tall.heightUnits - short.heightUnits).toBeCloseTo(
      (10 * 72) / 25.4,
      0,
    );
    const withText = renderBarcodeSVG("code128", value, {
      ...STYLE,
      barHeightMm: 10,
      quietZone: 0,
    });
    expect(withText.heightUnits).toBeGreaterThan(short.heightUnits);
  });

  it("turns encoder errors into plain messages", () => {
    expect(() => renderBarcodeSVG("gs1-128", "(17)261332", STYLE)).toThrow(
      "AI (17): invalid month.",
    );
    expect(() =>
      renderBarcodeSVG("datamatrix", "x".repeat(4000), STYLE),
    ).toThrow("Too much data for one Data Matrix. Shorten the text.");
    expect(
      encoderMessage(
        "EAN-13",
        new Error("bwipp.ean13badLength#6878: EAN-13 must be 12 or 13 digits"),
      ),
    ).toBe("EAN-13: EAN-13 must be 12 or 13 digits");
  });

  it("sizes the downloadable SVG in millimetres, one unit to a point", () => {
    const rendered = renderBarcodeSVG("ean13", "5901234123457", STYLE);
    const svg = printableSVG(rendered);
    const width = Number(/width="([\d.]+)mm"/.exec(svg)?.[1]);
    expect(width).toBeCloseTo((rendered.widthUnits * 25.4) / 72, 2);
    expect(svg).toContain('viewBox="0 0 ');
  });
});

describe("barcodeColorWarnings", () => {
  it("uses the same contrast lines as the QR scan score", () => {
    expect(BARCODE_CONTRAST).toEqual({
      min: SCAN_CONTRAST_MIN,
      low: SCAN_CONTRAST_LOW,
      fail: SCAN_CONTRAST_FAIL,
    });
  });

  it("passes dark bars on a light background", () => {
    expect(barcodeColorWarnings("#000000", "#ffffff")).toEqual([]);
    expect(barcodeColorWarnings("#1e3a8a", "#ffffff")).toEqual([]);
    expect(barcodeColorWarnings("#14532d", "#fffbeb")).toEqual([]);
  });

  it("flags low contrast, inverted bars and red bars", () => {
    expect(barcodeColorWarnings("#eeeeee", "#ffffff")[0]).toMatchObject({
      level: "error",
    });
    expect(barcodeColorWarnings("#888888", "#ffffff")[0]?.message).toMatch(
      /too low to scan reliably|below the 4.5:1/,
    );
    expect(
      barcodeColorWarnings("#ffffff", "#000000").map((w) => w.message),
    ).toEqual([expect.stringMatching(/Light bars on a dark background/)]);
    // This red passes on luminance (5.8:1), but under red scanner light
    // it's nearly as bright as the white.
    expect(
      barcodeColorWarnings("#cc0000", "#ffffff").map((w) => w.message),
    ).toEqual([expect.stringMatching(/red light/)]);
    // A dark maroon absorbs enough red light to pass.
    expect(barcodeColorWarnings("#5c0000", "#ffffff")).toEqual([]);
    expect(barcodeColorWarnings("#00000", "#ffffff")[0]?.message).toMatch(
      /six-digit hex/,
    );
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(app, dir), { recursive: true })
    .map(String)
    .filter(
      (file) => /\.(ts|tsx)$/.test(file) && !file.includes("node_modules"),
    )
    .map((file) => path.join(dir, file));
}

describe("bwip-js stays on /barcode-generator", () => {
  const files = ["app", "components", "lib"].flatMap(sourceFiles);
  const read = (file: string) => readFileSync(path.join(app, file), "utf8");

  it("is imported only by lib/barcode/render.ts", () => {
    const importers = files.filter((file) =>
      /from "@bwip-js\/browser"|import\("@bwip-js\/browser"\)/.test(read(file)),
    );
    expect(importers).toEqual([path.join("lib", "barcode", "render.ts")]);
  });

  it("whose renderer only the generator loads, with a dynamic import", () => {
    const static_ = files.filter((file) =>
      /^import (?!type )[^;]*from "@\/lib\/barcode\/render";/m.test(read(file)),
    );
    expect(static_).toEqual([]);
    const dynamic = files.filter((file) =>
      read(file).includes('import("@/lib/barcode/render")'),
    );
    expect(dynamic).toEqual([
      path.join("components", "sections", "tools", "barcode-generator.tsx"),
    ]);
    const users = files.filter((file) =>
      read(file).includes(
        'from "@/components/sections/tools/barcode-generator"',
      ),
    );
    expect(users).toEqual([
      path.join("app", "(home)", "barcode-generator", "page.tsx"),
    ]);
  });
});
