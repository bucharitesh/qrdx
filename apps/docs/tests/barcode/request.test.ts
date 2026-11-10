// The pieces behind the barcode API and saved barcodes: format spellings,
// request checks, stored styles read leniently, compact image URLs that
// round-trip, and the PDF writer's path conversion.
import { describe, expect, it } from "vitest";
import { BARCODE_FORMATS } from "@/lib/barcode/formats";
import { pathOperators } from "@/lib/barcode/pdf";
import {
  barcodeImageQuerySchema,
  parseBarcodeFormat,
  resolveBarcodeRequest,
} from "@/lib/barcode/request";
import {
  defaultBarcodeStyle,
  normalizeHex,
  storedBarcodeStyle,
  styleChanges,
} from "@/lib/barcode/style";
import { barcodeImageUrl } from "@/lib/barcode/url";

describe("parseBarcodeFormat", () => {
  it("reads every id and label, in any case, with or without dashes", () => {
    for (const format of BARCODE_FORMATS) {
      expect(parseBarcodeFormat(format.id)).toBe(format.id);
      expect(parseBarcodeFormat(format.label)).toBe(format.id);
      expect(parseBarcodeFormat(format.label.toUpperCase())).toBe(format.id);
    }
    expect(parseBarcodeFormat("ean_13")).toBe("ean13");
    expect(parseBarcodeFormat("UCC-128")).toBe("gs1-128");
    expect(parseBarcodeFormat("azteccode")).toBe("aztec");
    expect(parseBarcodeFormat("qr")).toBeNull();
  });
});

describe("normalizeHex", () => {
  it("takes #rgb, #rrggbb and either without #", () => {
    expect(normalizeHex("1E3A8A")).toBe("#1e3a8a");
    expect(normalizeHex("#fff")).toBe("#ffffff");
    expect(normalizeHex("abc")).toBe("#aabbcc");
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });
});

describe("resolveBarcodeRequest", () => {
  const query = (params: Record<string, string>) =>
    barcodeImageQuerySchema.parse(params);

  it("fills the format's defaults and reports what it added", () => {
    const result = resolveBarcodeRequest(
      query({ format: "ean13", data: "590123412345" }),
    );
    expect(result).toEqual({
      ok: true,
      request: {
        format: "ean13",
        value: "5901234123457",
        note: "Check digit 7 added.",
        style: defaultBarcodeStyle("ean13"),
        type: "svg",
      },
    });
  });

  it("names the parameter for every problem at once", () => {
    const result = resolveBarcodeRequest(
      query({ format: "code39", data: "abc", fg: "nope" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.param)).toEqual(["fg", "data"]);
  });

  it("keeps 2D quiet zones to 10 modules", () => {
    const result = resolveBarcodeRequest(
      query({ format: "aztec", data: "x", quietZone: "11" }),
    );
    expect(result).toEqual({
      ok: false,
      issues: [
        {
          param: "quietZone",
          message: "Aztec takes a quiet zone of up to 10 modules",
        },
      ],
    });
  });
});

describe("stored styles", () => {
  it("fall back to the format's defaults field by field", () => {
    expect(
      storedBarcodeStyle("code128", {
        foreground: "1e3a8a",
        scale: 99,
        rotation: 45,
        quietZone: 3,
        extra: true,
      }),
    ).toEqual({
      ...defaultBarcodeStyle("code128"),
      foreground: "#1e3a8a",
      quietZone: 3,
    });
    expect(storedBarcodeStyle("aztec", null)).toEqual(
      defaultBarcodeStyle("aztec"),
    );
  });

  it("store only what differs, and nothing linear-only for 2D codes", () => {
    expect(styleChanges("ean13", defaultBarcodeStyle("ean13"))).toEqual({});
    expect(
      styleChanges("datamatrix", {
        ...defaultBarcodeStyle("datamatrix"),
        showText: false,
        barHeightMm: 40,
        rotation: 90,
      }),
    ).toEqual({ rotation: 90 });
  });
});

describe("barcodeImageUrl", () => {
  it("round-trips through the image API's query", () => {
    const style = {
      ...defaultBarcodeStyle("code128"),
      foreground: "#1e3a8a",
      showText: false,
      rotation: 270 as const,
      scale: 2,
    };
    const url = new URL(
      barcodeImageUrl("https://qrdx.dev", "code128", "SHELF A&B", style, "png"),
    );
    expect(url.pathname).toBe("/api/v1/barcode");
    const parsed = barcodeImageQuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );
    const resolved = resolveBarcodeRequest(parsed);
    expect(resolved.ok && resolved.request).toEqual({
      format: "code128",
      value: "SHELF A&B",
      style,
      type: "png",
    });
  });
});

describe("pathOperators", () => {
  it("converts moves, lines and closes", () => {
    expect(pathOperators("M0 0L10 0L10 5Z")).toEqual([
      "0 0 m",
      "10 0 l",
      "10 5 l",
      "h",
    ]);
  });

  it("turns a quadratic curve into the same cubic", () => {
    // From (0,0) with control (3,6) to (6,0): controls at 2/3 of the way.
    expect(pathOperators("M0 0Q3 6 6 0")).toEqual(["0 0 m", "2 4 4 4 6 0 c"]);
  });

  it("refuses commands it doesn't draw", () => {
    expect(() => pathOperators("M0 0A1 1 0 0 1 2 2")).toThrow(
      /isn't supported/,
    );
  });
});
