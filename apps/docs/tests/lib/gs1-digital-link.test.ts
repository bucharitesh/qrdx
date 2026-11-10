// GS1 Digital Link for product pages (lib/gs1/digital-link.ts): GTIN check
// digits, the /01/<GTIN>[/22/..][/10/..][/21/..] path a custom domain
// resolves, and the GTIN a page publishes from its product block.
import { describe, expect, it } from "vitest";
import {
  digitalLinkUri,
  GS1_PATH,
  gtinProblem,
  normalizeGtin,
  pageGtin,
  parseDigitalLinkPath,
} from "@/lib/gs1/digital-link";

// GS1's own example GTIN, and one per length.
const GTIN14 = "09506000134352";
const GTIN13 = "4006381333931";
const GTIN12 = "036000291452";
const GTIN8 = "96385074";

describe("GTINs", () => {
  it("accepts 8, 12, 13 and 14 digits with a correct check digit", () => {
    for (const gtin of [GTIN14, GTIN13, GTIN12, GTIN8]) {
      expect(gtinProblem(gtin), gtin).toBeNull();
    }
    expect(gtinProblem("4006 3813 3393-1")).toBeNull();
  });

  it("explains what's wrong", () => {
    expect(gtinProblem("4006381333932")).toMatch(
      /check digit should be 1, not 2/,
    );
    expect(gtinProblem("40063813339")).toMatch(/8, 12, 13 or 14 digits/);
    expect(gtinProblem("40063813339X1")).toMatch(/digits only/);
    expect(gtinProblem("")).toMatch(/Enter a GTIN/);
  });

  it("pads to the 14 digits a Digital Link uses", () => {
    expect(normalizeGtin(GTIN13)).toBe(`0${GTIN13}`);
    expect(normalizeGtin(GTIN8)).toBe(`000000${GTIN8}`);
    expect(normalizeGtin("4006381333932")).toBeNull();
  });
});

describe("Digital Link paths", () => {
  it("parses the GTIN and its qualifiers", () => {
    expect(parseDigitalLinkPath(`/01/${GTIN14}`)).toEqual({
      ok: true,
      link: { gtin: GTIN14 },
    });
    expect(parseDigitalLinkPath(`/01/${GTIN13}/10/ABC-12/21/0001`)).toEqual({
      ok: true,
      link: { gtin: `0${GTIN13}`, lot: "ABC-12", serial: "0001" },
    });
    expect(parseDigitalLinkPath(`/01/${GTIN14}/22/2A/10/L%2F7/21/S1/`)).toEqual(
      {
        ok: true,
        link: { gtin: GTIN14, variant: "2A", lot: "L/7", serial: "S1" },
      },
    );
  });

  it("rejects a wrong check digit and malformed GTINs", () => {
    expect(parseDigitalLinkPath("/01/09506000134353")).toMatchObject({
      ok: false,
      reason: "check-digit",
    });
    for (const path of ["/01/123", "/01/abcdefgh", "/01/0950600013435299"]) {
      expect(parseDigitalLinkPath(path), path).toMatchObject({
        ok: false,
        reason: "gtin",
      });
    }
  });

  it("rejects unknown, repeated, out-of-order and bad qualifiers", () => {
    for (const path of [
      `/01/${GTIN14}/21/S1/10/L1`,
      `/01/${GTIN14}/10/L1/10/L2`,
      `/01/${GTIN14}/17/261231`,
      `/01/${GTIN14}/10`,
      `/01/${GTIN14}/10/${"A".repeat(21)}`,
      `/01/${GTIN14}/10/has%20space`,
    ]) {
      expect(parseDigitalLinkPath(path), path).toMatchObject({
        ok: false,
        reason: "qualifier",
      });
    }
  });

  it("ignores paths that aren't Digital Links", () => {
    for (const path of ["/", "/01", "/menu", "/p/01/x", "/02/123"]) {
      expect(parseDigitalLinkPath(path), path).toBeNull();
      expect(GS1_PATH.test(path), path).toBe(false);
    }
    expect(GS1_PATH.test(`/01/${GTIN14}/10/x`)).toBe(true);
  });

  it("builds the URI a pack's QR code holds", () => {
    expect(digitalLinkUri("go.brand.com", GTIN13)).toBe(
      `https://go.brand.com/01/0${GTIN13}`,
    );
    expect(
      digitalLinkUri("go.brand.com", GTIN14, { lot: "L 1", serial: "9" }),
    ).toBe(`https://go.brand.com/01/${GTIN14}/10/L%201/21/9`);
    expect(() => digitalLinkUri("go.brand.com", "123")).toThrow();
  });
});

describe("a page's GTIN", () => {
  const block = (props: Record<string, unknown>, hidden?: boolean) => ({
    type: "product",
    props,
    ...(hidden && { hidden }),
  });

  it("comes from the first visible product block with a valid GTIN", () => {
    expect(
      pageGtin({
        blocks: [
          { type: "header", props: { title: "x" } },
          block({ gtin: GTIN14 }, true),
          block({ gtin: "" }),
          block({ gtin: GTIN13 }),
        ],
      }),
    ).toBe(`0${GTIN13}`);
    expect(pageGtin({ blocks: [block({ gtin: "123" })] })).toBeNull();
    expect(pageGtin({ blocks: [] })).toBeNull();
  });
});
