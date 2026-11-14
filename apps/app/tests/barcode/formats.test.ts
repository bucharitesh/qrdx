// Input rules of the barcode generator (lib/barcode/formats.ts): characters,
// lengths and check digits for every symbology, against published examples.
import { describe, expect, it } from "vitest";
import {
  BARCODE_FORMATS,
  barcodeIssueText,
  compressUpca,
  decodedMatches,
  expandUpce,
  GS1_128_MAX_DATA,
  gs1CheckDigit,
  validateBarcodeInput,
} from "@/lib/barcode/formats";

/** The API's view of a success: value and English note (the codes are checked below). */
const ok = (id: Parameters<typeof validateBarcodeInput>[0], raw: string) => {
  const result = validateBarcodeInput(id, raw);
  if (!result.ok) throw new Error(`${id} "${raw}": ${result.error}`);
  const { notes: _codes, ...api } = result;
  return api;
};
const error = (id: Parameters<typeof validateBarcodeInput>[0], raw: string) => {
  const result = validateBarcodeInput(id, raw);
  if (result.ok) throw new Error(`${id} "${raw}" was accepted`);
  return result.error;
};

describe("BARCODE_FORMATS", () => {
  it("has every symbology the page promises, each with a valid example", () => {
    expect(BARCODE_FORMATS.map((format) => format.label)).toEqual([
      "EAN-13",
      "EAN-8",
      "UPC-A",
      "UPC-E",
      "Code 128",
      "Code 39",
      "ITF-14",
      "GS1-128",
      "Data Matrix",
      "PDF417",
      "Aztec",
    ]);
    for (const format of BARCODE_FORMATS) {
      expect(validateBarcodeInput(format.id, format.example)).toMatchObject({
        ok: true,
      });
      expect(format.quietZone.default).toBeGreaterThanOrEqual(
        format.quietZone.min,
      );
      expect(format.detectorFormats.length).toBeGreaterThan(0);
      expect(Boolean(format.barHeightMm)).toBe(format.kind === "linear");
    }
  });
});

describe("gs1CheckDigit", () => {
  // Published examples: GS1's sample GTINs and SSCC, Wikipedia's EAN-13,
  // EAN-8, UPC-A and ITF-14 examples and an ISBN-13.
  it.each([
    ["590123412345", 7], // EAN-13 5901234123457 (GS1)
    ["400638133393", 1], // EAN-13 4006381333931
    ["978030640615", 7], // ISBN 978-0-306-40615-7
    ["9638507", 4], // EAN-8 96385074
    ["03600029145", 2], // UPC-A 036000291452
    ["1540014128876", 3], // ITF-14 15400141288763
    ["0950110153000", 3], // GTIN-14 09501101530003 (GS1)
    ["10614141123456789", 7], // SSCC 106141411234567897 (GS1)
  ])("%s → %i", (body, digit) => {
    expect(gs1CheckDigit(body)).toBe(digit);
  });

  it("rejects anything but digits", () => {
    expect(() => gs1CheckDigit("12a")).toThrow();
  });
});

describe("EAN-13, EAN-8, UPC-A and ITF-14", () => {
  it("adds the check digit when it's left out", () => {
    expect(ok("ean13", "590123412345")).toEqual({
      ok: true,
      value: "5901234123457",
      note: "Check digit 7 added.",
    });
    expect(ok("ean8", "9638507").value).toBe("96385074");
    expect(ok("upca", "03600029145").value).toBe("036000291452");
    expect(ok("itf14", "1540014128876").value).toBe("15400141288763");
  });

  it("accepts a full number with the right check digit, ignoring spaces and hyphens", () => {
    expect(ok("ean13", "5 901234 123457")).toEqual({
      ok: true,
      value: "5901234123457",
    });
    expect(ok("ean13", "978-0-306-40615-7").value).toBe("9780306406157");
    expect(ok("ean8", "96385074").value).toBe("96385074");
    expect(ok("upca", "036000291452").value).toBe("036000291452");
    expect(ok("itf14", "1 54 00141 28876 3").value).toBe("15400141288763");
  });

  it("names the right check digit when it's wrong", () => {
    expect(error("ean13", "5901234123458")).toMatch(
      /check digit should be 7, not 8/,
    );
    expect(error("ean8", "96385075")).toMatch(/should be 4, not 5/);
    expect(error("upca", "036000291453")).toMatch(/should be 2, not 3/);
    expect(error("itf14", "15400141288764")).toMatch(/should be 3, not 4/);
  });

  it("explains wrong lengths and characters", () => {
    expect(error("ean13", "12345")).toBe(
      "EAN-13 needs 12 or 13 digits; this has 5 digits.",
    );
    expect(error("ean8", "12345678901")).toMatch(/7 or 8 digits/);
    expect(error("upca", "ABC")).toBe("UPC-A takes digits only.");
    expect(error("itf14", "")).toMatch(/Enter 13 digits/);
  });
});

describe("UPC-E", () => {
  it("expands and compresses like the standard's examples", () => {
    // Wikipedia: UPC-E 06543217 is UPC-A 065100004327.
    expect(expandUpce("06543217")).toBe("065100004327");
    expect(compressUpca("065100004327")).toBe("06543217");
    // One number for each rule (last digit 0-2, 3, 4 and 5-9), each in its
    // canonical form: the UPC-A shortens back to the same UPC-E.
    for (const [upce7, upca11] of [
      ["0120030", "01200000003"],
      ["0123453", "01230000045"],
      ["0123414", "01234000001"],
      ["0123455", "01234500005"],
    ] as const) {
      const upca = expandUpce(upce7);
      expect(upca.slice(0, 11)).toBe(upca11);
      expect(compressUpca(upca)).toBe(upce7 + upca.at(-1));
    }
    // Numbers without the zeros can't be shortened.
    expect(compressUpca("036000291452")).toBeNull();
  });

  it("takes 6, 7 or 8 digits and works out the check digit", () => {
    expect(ok("upce", "654321")).toEqual({
      ok: true,
      value: "06543217",
      note: "Number system 0 assumed. Check digit 7 added.",
    });
    expect(ok("upce", "0654321").value).toBe("06543217");
    expect(ok("upce", "06543217")).toEqual({ ok: true, value: "06543217" });
    expect(error("upce", "06543218")).toMatch(/should be 7, not 8/);
    expect(error("upce", "2654321")).toMatch(/number system 0 or 1/);
  });

  it("shortens a UPC-A that has a UPC-E form, and says when it doesn't", () => {
    expect(ok("upce", "065100004327")).toEqual({
      ok: true,
      value: "06543217",
      note: "Shortened from UPC-A 065100004327.",
    });
    expect(ok("upce", "06510000432").value).toBe("06543217");
    expect(error("upce", "036000291452")).toMatch(/no UPC-E form/);
  });
});

describe("Code 128 and Code 39", () => {
  it("takes printable ASCII in Code 128", () => {
    expect(ok("code128", "QRDX-2026-0042 a/b!").value).toBe(
      "QRDX-2026-0042 a/b!",
    );
    expect(error("code128", "café ✓")).toBe(
      "Code 128 here takes plain ASCII letters, digits, spaces and symbols. Not allowed: é ✓",
    );
    expect(error("code128", "x".repeat(81))).toMatch(/up to 80 characters/);
    expect(error("code128", "")).toBe("Enter the text to encode.");
  });

  it("takes Code 39's 43 characters and points lowercase to Code 128", () => {
    expect(ok("code39", "QRDX-39 $/+%.").value).toBe("QRDX-39 $/+%.");
    expect(error("code39", "qrdx")).toMatch(/no lowercase letters/);
    expect(error("code39", "AB*C")).toMatch(/Not allowed: \*/);
  });
});

describe("GS1-128", () => {
  it("accepts AIs in brackets and completes GTIN and SSCC check digits", () => {
    expect(ok("gs1-128", "(01)09501101530003(17)261231(10)AB-123")).toEqual({
      ok: true,
      value: "(01)09501101530003(17)261231(10)AB-123",
    });
    expect(ok("gs1-128", " (01) 0950110153000 (10)AB-123")).toEqual({
      ok: true,
      value: "(01)09501101530003(10)AB-123",
      note: "AI (01): Check digit 3 added.",
    });
    expect(ok("gs1-128", "(00)10614141123456789").value).toBe(
      "(00)106141411234567897",
    );
  });

  it("explains malformed input", () => {
    expect(error("gs1-128", "0109501101530003")).toMatch(
      /Start with an Application Identifier/,
    );
    expect(error("gs1-128", "(1)123")).toMatch(/AIs are 2 to 4 digits/);
    expect(error("gs1-128", "(10)")).toBe("AI (10) has no value after it.");
    expect(error("gs1-128", "(01)09501101530004")).toMatch(
      /^AI \(01\): .*should be 3, not 4/,
    );
    expect(error("gs1-128", "(10)AB 12(21)é")).toMatch(/GS1 doesn't allow: é/);
    expect(error("gs1-128", "(10)AB)")).toMatch(/Brackets don't line up/);
    expect(error("gs1-128", `(01)09501101530003(21)${"9".repeat(40)}`)).toMatch(
      new RegExp(`up to ${GS1_128_MAX_DATA} characters`),
    );
  });
});

describe("2D formats", () => {
  it("take any text, including Unicode and line breaks, up to the limit", () => {
    for (const id of ["datamatrix", "pdf417", "aztec"] as const) {
      expect(ok(id, "héllo ✓\nline two").value).toBe("héllo ✓\nline two");
      expect(error(id, "x".repeat(1001))).toMatch(/up to 1,000 characters/);
    }
  });
});

describe("decodedMatches", () => {
  it("accepts the ways readers report each symbology", () => {
    expect(decodedMatches("ean13", "5901234123457", "5901234123457")).toBe(
      true,
    );
    expect(decodedMatches("ean13", "5901234123457", "5901234123450")).toBe(
      false,
    );
    expect(decodedMatches("upca", "036000291452", "0036000291452")).toBe(true);
    expect(decodedMatches("upce", "06543217", "06543217")).toBe(true);
    expect(decodedMatches("upce", "06543217", "065100004327")).toBe(true);
    expect(decodedMatches("upce", "06543217", "0065100004327")).toBe(true);
    const gs1 = "(01)09501101530003(10)AB-123(17)261231";
    expect(
      decodedMatches("gs1-128", gs1, "010950110153000310AB-123\x1d17261231"),
    ).toBe(true);
    expect(decodedMatches("gs1-128", gs1, gs1)).toBe(true);
    expect(decodedMatches("code128", "ABC", "ABD")).toBe(false);
  });
});

describe("issue codes (the generator translates by code)", () => {
  it("every error carries a code whose English text is the error", () => {
    for (const [id, raw] of [
      ["ean13", ""],
      ["ean13", "59012341234x"],
      ["ean13", "5901234123450"],
      ["ean13", "59012"],
      ["upce", "123456789"],
      ["upce", "2123456"],
      ["code39", "abc"],
      ["code128", "naïve"],
      ["gs1-128", "01)09501101530003"],
      ["gs1-128", "(01)0950"],
      ["gs1-128", "(01)09501101530004"],
    ] as const) {
      const result = validateBarcodeInput(id, raw);
      if (result.ok) throw new Error(`${id} "${raw}" was accepted`);
      expect(barcodeIssueText(result.issue), `${id} ${raw}`).toBe(result.error);
    }
  });

  it("nests an AI's own problem, and lists characters as they are", () => {
    const wrong = validateBarcodeInput("gs1-128", "(01)09501101530004");
    expect(!wrong.ok && wrong.issue).toMatchObject({
      code: "gs1Ai",
      values: { ai: "01" },
      inner: { code: "wrongCheckDigit", values: { expected: 3, given: 4 } },
    });
    const chars = validateBarcodeInput("code39", "AB_C D\nE");
    expect(!chars.ok && chars.issue).toMatchObject({
      code: "code39Chars",
      chars: ["_", "\n"],
    });
  });

  it("gives notes as codes too", () => {
    const result = validateBarcodeInput("upce", "123456");
    expect(result.ok && result.notes?.map((note) => note.code)).toEqual([
      "numberSystemAssumed",
      "checkDigitAdded",
    ]);
  });
});
