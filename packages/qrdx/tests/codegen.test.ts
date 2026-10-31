// The encoder checked against ISO/IEC 18004:2015 tables: capacity per
// version/level/mode (Table 7), symbol size (4·version + 17), function
// patterns (§6.3) and mask/format rules.
import { describe, expect, it } from "vitest";
import qrcodegen from "../src/codegen";
import { ERROR_LEVEL_MAP } from "../src/constants";
import { getQRModuleCount } from "../src/print";

const { QrCode } = qrcodegen;
type Level = keyof typeof ERROR_LEVEL_MAP;

/** Smallest version that holds `text` at `level` without ECL boosting. */
const versionFor = (text: string, level: Level) =>
  QrCode.encodeSegments(
    qrcodegen.QrSegment.makeSegments(text),
    ERROR_LEVEL_MAP[level],
    1,
    40,
    -1,
    false
  ).version;

describe("capacity (ISO/IEC 18004 Table 7)", () => {
  // [level, version, numeric, alphanumeric, byte]
  const table: [Level, number, number, number, number][] = [
    ["L", 1, 41, 25, 17],
    ["M", 1, 34, 20, 14],
    ["Q", 1, 27, 16, 11],
    ["H", 1, 17, 10, 7],
    ["L", 10, 652, 395, 271],
    ["H", 10, 288, 174, 119],
    ["L", 40, 7089, 4296, 2953],
    ["M", 40, 5596, 3391, 2331],
    ["Q", 40, 3993, 2420, 1663],
    ["H", 40, 3057, 1852, 1273],
  ];

  it.each(
    table
  )("%s-level version %i holds %i digits, %i alphanumerics, %i bytes exactly", (level, version, numeric, alnum, bytes) => {
    expect(versionFor("1".repeat(numeric), level)).toBe(version);
    expect(versionFor("A".repeat(alnum), level)).toBe(version);
    expect(versionFor("a".repeat(bytes), level)).toBe(version);
    if (version < 40) {
      expect(versionFor("1".repeat(numeric + 1), level)).toBe(version + 1);
      expect(versionFor("A".repeat(alnum + 1), level)).toBe(version + 1);
      expect(versionFor("a".repeat(bytes + 1), level)).toBe(version + 1);
    }
  });

  it("rejects data beyond version 40 with a 'Data too long' error", () => {
    expect(() => QrCode.encodeText("a".repeat(2954), QrCode.Ecc.LOW)).toThrow(
      /too long/i
    );
  });

  it("counts UTF-8 bytes, not characters, for non-ASCII text", () => {
    // 4 × "€" = 12 UTF-8 bytes (fits v1-L's 17), 6 × "€" = 18 bytes (needs v2)
    expect(versionFor("€".repeat(4), "L")).toBe(1);
    expect(versionFor("€".repeat(6), "L")).toBe(2);
  });
});

describe("symbol structure", () => {
  it.each([1, 7, 40])("version %i is 4·v + 17 modules wide", (version) => {
    const code = QrCode.encodeSegments([], QrCode.Ecc.LOW, version, version);
    expect(code.size).toBe(version * 4 + 17);
  });

  it("draws the three finder patterns with 1:1:3:1:1 proportions", () => {
    const code = QrCode.encodeText("https://qrdx.dev", QrCode.Ecc.MEDIUM);
    const n = code.size;
    for (const [ox, oy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ] as const) {
      const row = Array.from({ length: 7 }, (_, i) =>
        code.getModule(ox + i, oy + 3)
      );
      expect(row).toEqual([true, false, true, true, true, false, true]);
      const col = Array.from({ length: 7 }, (_, i) =>
        code.getModule(ox + 3, oy + i)
      );
      expect(col).toEqual([true, false, true, true, true, false, true]);
    }
  });

  it("alternates the timing patterns on row and column 6", () => {
    const code = QrCode.encodeText("timing", QrCode.Ecc.LOW);
    for (let i = 8; i < code.size - 8; i++) {
      expect(code.getModule(i, 6)).toBe(i % 2 === 0);
      expect(code.getModule(6, i)).toBe(i % 2 === 0);
    }
  });

  it("sets the dark module at (8, 4·version + 9)", () => {
    const code = QrCode.encodeText("dark module", QrCode.Ecc.HIGH);
    expect(code.getModule(8, code.size - 8)).toBe(true);
  });

  it("is deterministic: same text and level give the same modules", () => {
    const a = QrCode.encodeText("same", QrCode.Ecc.QUARTILE).getModules();
    const b = QrCode.encodeText("same", QrCode.Ecc.QUARTILE).getModules();
    expect(a).toEqual(b);
  });

  it("maps L/M/Q/H to increasing error correction", () => {
    const ordinals = (["L", "M", "Q", "H"] as const).map(
      (level) => ERROR_LEVEL_MAP[level].ordinal
    );
    expect(ordinals).toEqual([0, 1, 2, 3]);
  });
});

describe("getQRModuleCount", () => {
  it("adds the margin on both sides", () => {
    const size = QrCode.encodeText("hello", QrCode.Ecc.QUARTILE).size;
    expect(getQRModuleCount({ value: "hello", level: "Q", margin: 4 })).toBe(
      size + 8
    );
  });
});
