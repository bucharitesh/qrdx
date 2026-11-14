// The shared EMV merchant-presented builder (utils/emv-qr.ts): CRC16-CCITT
// against published payloads, TLV build and parse, amounts and text.
import { describe, expect, it } from "vitest";
import {
  buildEmvPayload,
  crc16Ccitt,
  EmvLengthError,
  emvAmount,
  emvTemplate,
  emvTlv,
  parseEmvObjects,
  parseEmvPayload,
  serializeEmv,
  toEmvText,
} from "@/utils/emv-qr";
import { PUBLISHED } from "../support/emv-published";

describe("crc16Ccitt", () => {
  it("is CRC-16/CCITT-FALSE (check value 29B1 for 123456789)", () => {
    expect(crc16Ccitt("123456789")).toBe("29B1");
    expect(crc16Ccitt("")).toBe("FFFF");
  });

  it.each(Object.entries(PUBLISHED))(
    "matches the checksum published in %s",
    (_name, payload) => {
      expect(crc16Ccitt(payload.slice(0, -4))).toBe(payload.slice(-4));
    },
  );

  it("pads to four uppercase hex digits", () => {
    for (const input of ["a", "ab", "000201", "x".repeat(50)]) {
      expect(crc16Ccitt(input)).toMatch(/^[0-9A-F]{4}$/);
    }
  });
});

describe("TLV", () => {
  it("writes ID, two-digit length and value", () => {
    expect(emvTlv("00", "01")).toBe("000201");
    expect(emvTlv("59", "Fulano de Tal")).toBe("5913Fulano de Tal");
  });

  it("refuses values longer than 99 characters and bad IDs", () => {
    expect(() => emvTlv("62", "x".repeat(100))).toThrow(EmvLengthError);
    expect(() => emvTlv("6", "x")).toThrow(/ID/);
  });

  it("nests templates and leaves empty values out", () => {
    expect(
      serializeEmv([
        [
          "26",
          [
            ["00", "br.gov.bcb.pix"],
            ["01", "key"],
            ["02", ""],
          ],
        ],
        ["54", ""],
      ]),
    ).toBe("26250014br.gov.bcb.pix0103key");
  });

  it("builds the published Pix example byte for byte", () => {
    expect(
      buildEmvPayload([
        ["00", "01"],
        [
          "26",
          [
            ["00", "br.gov.bcb.pix"],
            ["01", "123e4567-e12b-12d1-a456-426655440000"],
          ],
        ],
        ["52", "0000"],
        ["53", "986"],
        ["58", "BR"],
        ["59", "Fulano de Tal"],
        ["60", "BRASILIA"],
        ["62", [["05", "***"]]],
      ]),
    ).toBe(PUBLISHED.pix);
  });

  it("parses what it builds", () => {
    const parsed = parseEmvPayload(PUBLISHED.vietqrAmount);
    expect(parsed?.crcValid).toBe(true);
    expect(parsed?.fields.get("54")).toBe("10000");
    const account = emvTemplate(parsed?.fields.get("38"));
    expect(account.get("00")).toBe("A000000727");
    expect(emvTemplate(account.get("01")).get("01")).toBe("257678859");
    expect(emvTemplate(parsed?.fields.get("62")).get("08")).toBe("Chuyen tien");
  });

  it("flags a payload whose checksum doesn't match", () => {
    const broken = `${PUBLISHED.pix.slice(0, -4)}0000`;
    expect(parseEmvPayload(broken)?.crcValid).toBe(false);
  });

  it("rejects text that isn't an EMV payload", () => {
    expect(parseEmvPayload("hello")).toBeNull();
    expect(parseEmvPayload("000201")).toBeNull();
    expect(parseEmvPayload("0002010102")).toBeNull();
    expect(parseEmvObjects("12ab")).toBeNull();
    expect(parseEmvObjects("0105abc")).toBeNull();
    // An SSCC (GS1 AI 00) starting with the same digits isn't EMV.
    expect(parseEmvPayload("00020123456789012345")).toBeNull();
  });
});

describe("emvAmount", () => {
  it.each([
    ["12.5", 2, "12.50"],
    ["12,50", 2, "12.50"],
    ["0012", 2, "12.00"],
    ["4.22", 2, "4.22"],
    ["50000", 0, "50000"],
  ])("%s with %i decimals → %s", (raw, decimals, expected) => {
    expect(emvAmount(raw, decimals)).toBe(expected);
  });

  it.each([
    ["0", 2],
    ["1,000.00", 2],
    ["1.234", 2],
    ["12.5", 0],
    ["-3", 2],
    ["abc", 2],
    ["12345678901.00", 2],
  ])("refuses %s with %i decimals", (raw, decimals) => {
    expect(emvAmount(raw, decimals)).toBeNull();
  });
});

describe("toEmvText", () => {
  it("drops accents and anything outside printable ASCII", () => {
    expect(toEmvText("São Paulo")).toBe("Sao Paulo");
    expect(toEmvText("Đà Nẵng")).toBe("Da Nang");
    expect(toEmvText("Chuyển tiền  nhé")).toBe("Chuyen tien nhe");
    expect(toEmvText("Café ☕\n")).toBe("Cafe");
  });
});
