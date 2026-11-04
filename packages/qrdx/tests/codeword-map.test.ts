/** biome-ignore-all lint/style/noMagicNumbers: QR structure and test matrix */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: codeword bits and xorshift */
// The module → (block, codeword, bit) map must match where qrcodegen really
// draws each codeword bit. Each case encodes known data codewords at a fixed
// mask, builds the expected blocks (data split per ISO/IEC 18004 §7.5.2 plus
// qrcodegen's own Reed–Solomon), un-masks the real modules and checks every
// mapped bit against the codeword the map names.
import { describe, expect, it } from "vitest";
import { getQRFunctionModules } from "../src/art";
import qrcodegen from "../src/codegen";
import { damagedCodewords, getCodewordMap } from "../src/codeword-map";
import { ERROR_LEVEL_MAP } from "../src/constants";
import type { ErrorLevel } from "../types";

const { QrCode } = qrcodegen;
const LEVELS: ErrorLevel[] = ["L", "M", "Q", "H"];

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Deterministic bytes (xorshift), so failures reproduce. */
function bytes(count: number, seed: number): number[] {
  let s = seed >>> 0 || 1;
  return Array.from({ length: count }, () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) & 0xff;
  });
}

/** Every block's codewords (data, then ECC), as the standard defines them. */
function expectedBlocks(version: number, level: ErrorLevel, data: number[]) {
  const ordinal = ERROR_LEVEL_MAP[level].ordinal;
  const count = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ordinal]?.[version] ?? 0;
  const ecc = QrCode.ECC_CODEWORDS_PER_BLOCK[ordinal]?.[version] ?? 0;
  const raw = Math.floor(QrCode.getNumRawDataModules(version) / 8);
  const longBlocks = raw % count;
  const shortData = Math.floor(raw / count) - ecc;
  const divisor = QrCode.reedSolomonComputeDivisor(ecc);
  const blocks: number[][] = [];
  let k = 0;
  for (let j = 0; j < count; j++) {
    const length = shortData + (j >= count - longBlocks ? 1 : 0);
    const dat = data.slice(k, k + length);
    k += length;
    blocks.push([...dat, ...QrCode.reedSolomonComputeRemainder(dat, divisor)]);
  }
  expect(k).toBe(data.length);
  return blocks;
}

function dataCodewordCount(version: number, level: ErrorLevel) {
  const ordinal = ERROR_LEVEL_MAP[level].ordinal;
  return (
    Math.floor(QrCode.getNumRawDataModules(version) / 8) -
    (QrCode.ECC_CODEWORDS_PER_BLOCK[ordinal]?.[version] ?? 0) *
      (QrCode.NUM_ERROR_CORRECTION_BLOCKS[ordinal]?.[version] ?? 0)
  );
}

const CASES: [number, ErrorLevel, number][] = [];
for (const version of [1, 2, 3, 5, 7, 10, 14, 21, 27, 40]) {
  for (const [i, level] of LEVELS.entries()) {
    CASES.push([version, level, (version + i * 3) % 8]);
  }
}

describe("codeword map", () => {
  it.each(CASES)(
    "version %i-%s, mask %i: every mapped module holds that codeword's bit",
    (version, level, mask) => {
      const map = getCodewordMap(version, level);
      const data = bytes(
        dataCodewordCount(version, level),
        version * 31 + mask
      );
      const blocks = expectedBlocks(version, level, data);
      const qr = new QrCode(version, ERROR_LEVEL_MAP[level], data, mask);
      const modules = qr.getModules();
      const { size } = map;
      expect(qr.size).toBe(size);
      expect(map.blocks).toBe(blocks.length);
      expect(map.blockLengths).toEqual(blocks.map((b) => b.length));

      const invert = MASKS[mask] as (x: number, y: number) => boolean;
      const placed = new Set<number>();
      let mismatches = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const m = y * size + x;
          const b = map.block[m] as number;
          if (b < 0) continue;
          const k = map.codeword[m] as number;
          const bit = map.bit[m] as number;
          const value = ((blocks[b]?.[k] as number) >>> bit) & 1;
          const drawn = Boolean(modules[y]?.[x]) !== invert(x, y);
          if (drawn !== (value === 1)) mismatches++;
          placed.add((b * 4096 + k) * 8 + bit);
        }
      }
      expect(mismatches).toBe(0);
      // Each bit of each codeword lands on exactly one module.
      const total = blocks.reduce((sum, b) => sum + b.length, 0) * 8;
      expect(placed.size).toBe(total);
    }
  );

  it("leaves only function patterns and remainder bits unmapped", () => {
    for (let version = 1; version <= 40; version++) {
      const map = getCodewordMap(version, "M");
      const fn = getQRFunctionModules(version);
      let unmappedData = 0;
      for (let y = 0; y < map.size; y++) {
        for (let x = 0; x < map.size; x++) {
          const mapped = (map.block[y * map.size + x] as number) >= 0;
          if (fn[y]?.[x]) {
            expect(mapped).toBe(false);
          } else if (!mapped) {
            unmappedData++;
          }
        }
      }
      expect(unmappedData).toBe(QrCode.getNumRawDataModules(version) % 8);
    }
  });

  it("repairs half the ECC codewords, less ISO 18004 Table 9's misdecode protection", () => {
    // [version, level, blocks, ecc per block, correctable]
    const table: [number, ErrorLevel, number, number, number][] = [
      [1, "L", 1, 7, 2],
      [1, "M", 1, 10, 4],
      [1, "Q", 1, 13, 6],
      [1, "H", 1, 17, 8],
      [2, "L", 1, 10, 4],
      [2, "H", 1, 28, 14],
      [3, "L", 1, 15, 7],
      [3, "Q", 2, 18, 9],
      [5, "H", 4, 22, 11],
      [10, "L", 4, 18, 9],
    ];
    for (const [version, level, blocks, ecc, correctable] of table) {
      const map = getCodewordMap(version, level);
      expect([map.blocks, map.eccPerBlock, map.correctable]).toEqual([
        blocks,
        ecc,
        correctable,
      ]);
    }
  });

  it("counts each damaged codeword once per block", () => {
    const map = getCodewordMap(5, "H");
    const all = Array.from({ length: map.size * map.size }, (_, m) => m);
    expect(damagedCodewords(map, all)).toEqual(map.blockLengths);
    expect(damagedCodewords(map, [])).toEqual([0, 0, 0, 0]);
    // The 8 bits of one codeword cost one error, not eight.
    const one = all.filter((m) => map.block[m] === 2 && map.codeword[m] === 5);
    expect(one).toHaveLength(8);
    expect(damagedCodewords(map, one)).toEqual([0, 0, 1, 0]);
  });
});
