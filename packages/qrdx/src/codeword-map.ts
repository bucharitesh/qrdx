/** biome-ignore-all lint/style/noMagicNumbers: QR code structure (ISO/IEC 18004) */
/** biome-ignore-all lint/suspicious/noBitwiseOperators: codeword bit placement */
// Where every codeword of a QR code sits. qrcodegen splits the data into
// Reed–Solomon blocks, interleaves the blocks' codewords, and draws the
// result bit by bit in a two-column zigzag from the bottom-right corner,
// skipping function patterns (ISO/IEC 18004 §7.7). Anything drawn over the
// code, such as a badge plate or a logo, costs one error in every codeword it
// touches, and each block repairs only so many. This maps each module back to
// its (block, codeword) so that cost can be counted exactly instead of
// estimated from the covered area.
import type { ErrorLevel } from "../types";
import qrcodegen from "./codegen";
import { ERROR_LEVEL_MAP } from "./constants";

const { QrCode } = qrcodegen;

export interface CodewordMap {
  version: number;
  level: ErrorLevel;
  /** Modules per side */
  size: number;
  /** Reed–Solomon blocks */
  blocks: number;
  /** Error correction codewords in each block */
  eccPerBlock: number;
  /** Codewords (data, then error correction) in each block */
  blockLengths: number[];
  /**
   * Wrong codewords each block can repair: half its error correction
   * codewords, less the few that ISO/IEC 18004 Table 9 keeps back for
   * misdecode protection in versions 1–3.
   */
  correctable: number;
  /** Per module (y × size + x): block of its codeword, -1 if it carries none */
  block: Int16Array;
  /** Per module: index of its codeword in that block, -1 if none */
  codeword: Int16Array;
  /** Per module: bit of that codeword (7 = most significant), -1 if none */
  bit: Int8Array;
}

/**
 * Codewords that versions 1–3 keep for misdecode protection, the "p" of
 * ISO/IEC 18004 Table 9: those blocks repair (ecc − p) / 2 errors, not
 * ecc / 2.
 */
const MISDECODE_PROTECTION: Record<string, number> = {
  "1L": 3,
  "1M": 2,
  "1Q": 1,
  "1H": 1,
  "2L": 2,
  "3L": 1,
};

/** Function modules (finders, separators, timing, alignment, format, version). */
function functionModules(version: number): Uint8Array {
  const size = version * 4 + 17;
  const grid = new Uint8Array(size * size);
  const mark = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      grid[y * size + x] = 1;
    }
  };
  for (let i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        mark(cx + dx, cy + dy);
      }
    }
  }
  const positions: number[] = [];
  if (version > 1) {
    const count = Math.floor(version / 7) + 2;
    const step =
      version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    positions.push(6);
    for (let pos = size - 7; positions.length < count; pos -= step) {
      positions.splice(1, 0, pos);
    }
  }
  const last = positions.length - 1;
  for (const [i, cx] of positions.entries()) {
    for (const [j, cy] of positions.entries()) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0)
      ) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          mark(cx + dx, cy + dy);
        }
      }
    }
  }
  // Format information, both copies, and the always-dark module
  for (let i = 0; i <= 8; i++) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    mark(size - 1 - i, 8);
    mark(8, size - 1 - i);
  }
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      mark(a, b);
      mark(b, a);
    }
  }
  return grid;
}

function buildMap(version: number, level: ErrorLevel): CodewordMap {
  const size = version * 4 + 17;
  const ordinal = ERROR_LEVEL_MAP[level].ordinal;
  const blocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ordinal]?.[version] ?? 0;
  const eccPerBlock = QrCode.ECC_CODEWORDS_PER_BLOCK[ordinal]?.[version] ?? 0;
  const rawCodewords = Math.floor(QrCode.getNumRawDataModules(version) / 8);
  const shortBlocks = blocks - (rawCodewords % blocks);
  const shortLength = Math.floor(rawCodewords / blocks);
  const blockLengths = Array.from(
    { length: blocks },
    (_, j) => shortLength + (j < shortBlocks ? 0 : 1)
  );

  // Interleaved order (qrcodegen's addEccAndInterleave): codeword i of every
  // block in turn, where short blocks skip the slot after their data.
  const streamBlock: number[] = [];
  const streamCodeword: number[] = [];
  const padSlot = shortLength - eccPerBlock;
  for (let i = 0; i <= shortLength; i++) {
    for (let j = 0; j < blocks; j++) {
      if (j < shortBlocks) {
        if (i === padSlot) {
          continue;
        }
        streamBlock.push(j);
        streamCodeword.push(i < padSlot ? i : i - 1);
      } else {
        streamBlock.push(j);
        streamCodeword.push(i);
      }
    }
  }
  if (streamBlock.length !== rawCodewords) {
    throw new Error(`Codeword map: interleave mismatch at version ${version}`);
  }

  // Zigzag placement (qrcodegen's drawCodewords)
  const isFunction = functionModules(version);
  const block = new Int16Array(size * size).fill(-1);
  const codeword = new Int16Array(size * size).fill(-1);
  const bit = new Int8Array(size * size).fill(-1);
  const totalBits = rawCodewords * 8;
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = upward ? size - 1 - vert : vert;
        const m = y * size + x;
        if (!isFunction[m] && index < totalBits) {
          const stream = index >>> 3;
          block[m] = streamBlock[stream] as number;
          codeword[m] = streamCodeword[stream] as number;
          bit[m] = 7 - (index & 7);
          index++;
        }
      }
    }
  }
  if (index !== totalBits) {
    throw new Error(`Codeword map: placement mismatch at version ${version}`);
  }

  const protection = MISDECODE_PROTECTION[`${version}${level}`] ?? 0;
  return {
    version,
    level,
    size,
    blocks,
    eccPerBlock,
    blockLengths,
    correctable: Math.floor((eccPerBlock - protection) / 2),
    block,
    codeword,
    bit,
  };
}

const MAP_CACHE_LIMIT = 8;
const mapCache = new Map<string, CodewordMap>();

/**
 * The (block, codeword, bit) every module of a version `version`, level
 * `level` code carries. The mask doesn't move codewords, so one map serves
 * all eight masks.
 */
export function getCodewordMap(
  version: number,
  level: ErrorLevel
): CodewordMap {
  if (!(Number.isInteger(version) && version >= 1 && version <= 40)) {
    throw new RangeError(`QR version must be 1–40, got ${version}`);
  }
  const key = `${version}${level}`;
  const cached = mapCache.get(key);
  if (cached) {
    mapCache.delete(key);
    mapCache.set(key, cached);
    return cached;
  }
  const map = buildMap(version, level);
  if (mapCache.size >= MAP_CACHE_LIMIT) {
    const oldest = mapCache.keys().next().value;
    if (oldest !== undefined) {
      mapCache.delete(oldest);
    }
  }
  mapCache.set(key, map);
  return map;
}

/**
 * Codewords per block that have at least one module among `modules`
 * (indexes y × size + x). Each counts as one error: a covered module reads
 * wrong about half the time, and one wrong bit spoils the whole codeword.
 */
export function damagedCodewords(
  map: CodewordMap,
  modules: Iterable<number>
): number[] {
  const counts = new Array<number>(map.blocks).fill(0);
  const seen = new Set<number>();
  for (const m of modules) {
    const b = map.block[m] ?? -1;
    if (b < 0) {
      continue;
    }
    const key = b * 4096 + (map.codeword[m] as number);
    if (!seen.has(key)) {
      seen.add(key);
      counts[b] = (counts[b] as number) + 1;
    }
  }
  return counts;
}
