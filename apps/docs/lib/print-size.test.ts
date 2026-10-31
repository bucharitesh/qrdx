// Run: cd apps/docs && npx tsx --test lib/print-size.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculatePrintSize,
  detectMode,
  getCapacity,
  getMinVersion,
  modulesForVersion,
  pixelsForPrint,
  toMillimeters,
} from "./print-size";

describe("getCapacity matches the ISO/IEC 18004 capacity table", () => {
  const cases: [number, "L" | "M" | "Q" | "H", number, number, number][] = [
    // version, ecc, numeric, alphanumeric, byte
    [1, "L", 41, 25, 17],
    [1, "M", 34, 20, 14],
    [1, "Q", 27, 16, 11],
    [1, "H", 17, 10, 7],
    [10, "L", 652, 395, 271],
    [10, "H", 288, 174, 119],
    [40, "L", 7089, 4296, 2953],
    [40, "M", 5596, 3391, 2331],
    [40, "Q", 3993, 2420, 1663],
    [40, "H", 3057, 1852, 1273],
  ];

  for (const [version, ecc, numeric, alpha, byte] of cases) {
    it(`version ${version}-${ecc}`, () => {
      assert.equal(getCapacity(version, ecc, "numeric"), numeric);
      assert.equal(getCapacity(version, ecc, "alphanumeric"), alpha);
      assert.equal(getCapacity(version, ecc, "byte"), byte);
    });
  }
});

describe("detectMode", () => {
  it("picks the densest single mode", () => {
    assert.equal(detectMode("0123456789"), "numeric");
    assert.equal(detectMode("HTTPS://QRDX.DEV"), "alphanumeric");
    assert.equal(detectMode("https://qrdx.dev"), "byte");
  });
});

describe("getMinVersion", () => {
  it("finds the smallest version that fits", () => {
    // 16 bytes: too big for 1-M (14), fits 2-M (26)
    assert.equal(getMinVersion("https://qrdx.dev", "M"), 2);
    assert.equal(getMinVersion("12345678901234567", "L"), 1);
  });

  it("counts UTF-8 bytes, not characters", () => {
    // 6 characters, 18 bytes
    assert.equal(getMinVersion("日本語日本語", "L"), 2);
  });

  it("returns null when the payload cannot fit", () => {
    assert.equal(getMinVersion("a".repeat(3000), "L"), null);
  });
});

describe("calculatePrintSize", () => {
  it("scales module size with distance", () => {
    const result = calculatePrintSize({
      distanceMm: 1000,
      modules: modulesForVersion(2),
    });
    assert.equal(result.moduleMm, 4);
    assert.equal(result.symbolMm, 100);
    assert.equal(result.totalMm, 132);
    assert.equal(result.ruleOfThumbMm, 100);
    assert.equal(result.limitedBy, "distance");
  });

  it("never goes below the 0.4 mm module minimum", () => {
    const result = calculatePrintSize({ distanceMm: 50, modules: 25 });
    assert.equal(result.moduleMm, 0.4);
    assert.equal(result.limitedBy, "minimum-module");
  });

  it("rejects invalid input", () => {
    assert.throws(() => calculatePrintSize({ distanceMm: 0, modules: 25 }));
    assert.throws(() => calculatePrintSize({ distanceMm: 100, modules: 10 }));
  });
});

describe("unit helpers", () => {
  it("converts distances and print pixels", () => {
    assert.equal(toMillimeters(2, "m"), 2000);
    assert.equal(toMillimeters(1, "ft"), 304.8);
    assert.equal(pixelsForPrint(25.4, 300), 300);
  });
});
