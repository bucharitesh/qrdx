// Run: cd apps/docs && npx tsx --test lib/print-size.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPrintLayout, getQRModuleCount } from "qrdx";
import {
  calculatePrintSize,
  detectMode,
  fromMillimeters,
  getCapacity,
  getMinVersion,
  moduleForPrintWidth,
  moduleForScanDistance,
  modulesForVersion,
  pixelsForPrint,
  printWidthForScanDistance,
  SCAN_DISTANCE_PER_MODULE,
  scanDistanceForModule,
  scanDistanceForPrintWidth,
  scanDistanceUnit,
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
    assert.equal(fromMillimeters(2000, "m"), 2);
    assert.equal(fromMillimeters(304.8, "ft"), 1);
    assert.equal(pixelsForPrint(25.4, 300), 300);
  });
});

describe("Print-ready scan distance ↔ code width (module-aware)", () => {
  // The editor's default design: level Q, the engine's default quiet zone.
  const DEFAULT_CODE = {
    value: "https://example.org/menu",
    level: "Q" as const,
  };
  const defaultModules = getQRModuleCount(DEFAULT_CODE);

  it("scans from about 250 modules (10:1 for a 25-module code)", () => {
    assert.equal(SCAN_DISTANCE_PER_MODULE, 250);
    assert.equal(scanDistanceForModule(4), 1000);
    assert.equal(moduleForScanDistance(1000), 4);
    // A 25-module code 100 mm wide: the familiar 10:1.
    assert.equal(scanDistanceForPrintWidth(100, "mm", 25, "m"), 1);
  });

  it("reads the module span the way qrdx's print layout does", () => {
    for (const size of [40, 132, 333, 2000]) {
      const layout = getPrintLayout(DEFAULT_CODE, { size, unit: "mm" });
      assert.equal(layout.moduleCount, defaultModules);
      assert.equal(
        moduleForPrintWidth(size, "mm", layout.moduleCount),
        layout.moduleSize,
      );
      assert.equal(
        scanDistanceForPrintWidth(size, "mm", layout.moduleCount, "m"),
        fromMillimeters(scanDistanceForModule(layout.moduleSize), "m"),
      );
    }
  });

  it("denser codes need bigger prints for the same distance", () => {
    const short = printWidthForScanDistance(1, "m", "mm", 25);
    const dense = printWidthForScanDistance(1, "m", "mm", 57);
    assert.equal(short, 100);
    assert.equal(dense, 228);
  });

  it("gives no distance for modules under the 0.4 mm minimum", () => {
    // 33 modules: 13.2 mm is exactly 0.4 mm a module (100 mm away).
    const atMinimum = scanDistanceForPrintWidth(13.2, "mm", 33, "m");
    assert.ok(atMinimum !== null && Math.abs(atMinimum - 0.1) < 1e-9);
    assert.equal(scanDistanceForPrintWidth(13.1, "mm", 33, "m"), null);
    assert.equal(scanDistanceForPrintWidth(5, "mm", 33, "m"), null);
    // A short distance gets the smallest printable width, not a smaller one.
    assert.equal(printWidthForScanDistance(0.02, "m", "mm", 33), 13.2);
    const inches = printWidthForScanDistance(0.1, "ft", "in", 33);
    assert.notEqual(scanDistanceForPrintWidth(inches, "in", 33, "ft"), null);
  });

  it("pairs metres with mm and feet with inches", () => {
    assert.equal(scanDistanceUnit("mm"), "m");
    assert.equal(scanDistanceUnit("in"), "ft");
  });

  it("rounds widths to what the field holds: 0.1 mm, 0.01 in", () => {
    assert.equal(printWidthForScanDistance(1 / 3, "m", "mm", 25), 33.3);
    assert.equal(printWidthForScanDistance(5, "ft", "in", 25), 6);
    assert.equal(printWidthForScanDistance(1 / 3, "ft", "in", 25), 0.4);
  });

  it("round-trips distance → width → distance", () => {
    for (const modules of [25, 33, 41, 57, 105]) {
      for (const [distance, unit, widthUnit] of [
        [0.5, "m", "mm"],
        [1, "m", "mm"],
        [3.7, "m", "mm"],
        [10, "ft", "in"],
        [40, "ft", "in"],
      ] as const) {
        const width = printWidthForScanDistance(
          distance,
          unit,
          widthUnit,
          modules,
        );
        const back = scanDistanceForPrintWidth(width, widthUnit, modules, unit);
        assert.ok(back !== null, `${distance} ${unit} at ${modules} modules`);
        // Only the width field's rounding (0.05 mm or 0.005 in) moves it.
        const step = widthUnit === "in" ? 0.005 * 25.4 : 0.05;
        const tolerance = fromMillimeters(
          scanDistanceForModule(step / modules),
          unit,
        );
        assert.ok(
          Math.abs(back - distance) <= tolerance + 1e-9,
          `${distance} ${unit} → ${width} ${widthUnit} → ${back} ${unit}`,
        );
      }
    }
  });

  it("matches /tools/print-size: its module size reads back as the same distance", () => {
    for (const modules of [21, 25, 33, 49, 77]) {
      for (const distanceMm of [300, 1000, 2500, 8000]) {
        const tool = calculatePrintSize({ distanceMm, modules });
        // The Print tab spans its own quiet zone (here 2 modules a side; the
        // tool assumes 4), so compare module sizes, not widths.
        const editorModules = modules + 2 * 2;
        const width = printWidthForScanDistance(
          distanceMm / 1000,
          "m",
          "mm",
          editorModules,
        );
        const moduleMm = moduleForPrintWidth(width, "mm", editorModules);
        assert.ok(
          Math.abs(moduleMm - tool.moduleMm) <= 0.05 / editorModules + 1e-9,
          `${modules} modules, ${distanceMm} mm: ${moduleMm} vs ${tool.moduleMm}`,
        );
        const back = scanDistanceForPrintWidth(width, "mm", editorModules, "m");
        assert.ok(back !== null);
        assert.ok(
          Math.abs(back * 1000 - distanceMm) <=
            scanDistanceForModule(0.05 / editorModules) + 1e-9,
          `${distanceMm} mm read back as ${back} m`,
        );
      }
    }
  });
});
