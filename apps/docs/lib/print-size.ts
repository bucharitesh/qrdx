/**
 * Pure helpers behind the /tools/print-size calculator.
 *
 * Capacity math follows ISO/IEC 18004 (the same tables the qrdx encoder,
 * Nayuki's qrcodegen, uses), so the version computed here matches what QRdx
 * actually generates for a given payload and error-correction level.
 */

export type EccLevel = "L" | "M" | "Q" | "H";
export type EncodingMode = "numeric" | "alphanumeric" | "byte";
export type DistanceUnit = "cm" | "m" | "in" | "ft";

export const ECC_LEVELS: readonly EccLevel[] = ["L", "M", "Q", "H"];
export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

/** Blank border the QR spec requires around the symbol, in modules. */
export const QUIET_ZONE_MODULES = 4;
/** Smallest module (single square) size we recommend printing, in mm. */
export const MIN_MODULE_MM = 0.4;
/** Classic rule of thumb: a code can be read from about 10x its width. */
export const DISTANCE_TO_SIZE_RATIO = 10;
/**
 * Modules per side the 10:1 rule is calibrated against: a version 2 code
 * (25 x 25), typical for a short URL. Denser codes need a larger print.
 */
export const REFERENCE_MODULES = 25;

const MM_PER_INCH = 25.4;

const MM_PER_UNIT: Record<DistanceUnit, number> = {
  cm: 10,
  m: 1000,
  in: MM_PER_INCH,
  ft: 304.8,
};

const ECC_INDEX: Record<EccLevel, number> = { L: 0, M: 1, Q: 2, H: 3 };

// Index 0 is padding; versions 1..40. Source: ISO/IEC 18004 table 9.
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [
    -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30,
    28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30,
  ],
  [
    -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26,
    26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    28, 28, 28,
  ],
  [
    -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28,
    26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30,
  ],
  [
    -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28,
    26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30,
  ],
];

const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  [
    -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10,
    12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
  ],
  [
    -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17,
    17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  [
    -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23,
    23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  [
    -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
    25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77,
    81,
  ],
];

const NUMERIC_REGEX = /^[0-9]*$/;
const ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+./:-]*$/;

function assertVersion(version: number): void {
  if (
    !Number.isInteger(version) ||
    version < MIN_VERSION ||
    version > MAX_VERSION
  ) {
    throw new RangeError(`QR version must be an integer from 1 to 40`);
  }
}

/** Modules per side (without the quiet zone) for a QR version. */
export function modulesForVersion(version: number): number {
  assertVersion(version);
  return 17 + 4 * version;
}

function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Data (non error-correction) bits available in a symbol. */
export function getDataCapacityBits(version: number, ecc: EccLevel): number {
  assertVersion(version);
  const i = ECC_INDEX[ecc];
  const dataCodewords =
    Math.floor(getNumRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[i][version] *
      NUM_ERROR_CORRECTION_BLOCKS[i][version];
  return dataCodewords * 8;
}

function charCountBits(mode: EncodingMode, version: number): number {
  const tier = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  if (mode === "numeric") return [10, 12, 14][tier];
  if (mode === "alphanumeric") return [9, 11, 13][tier];
  return [8, 16, 16][tier];
}

function payloadBits(mode: EncodingMode, length: number): number {
  if (mode === "numeric") {
    const rest = length % 3;
    return Math.floor(length / 3) * 10 + (rest === 0 ? 0 : rest === 1 ? 4 : 7);
  }
  if (mode === "alphanumeric") {
    return Math.floor(length / 2) * 11 + (length % 2) * 6;
  }
  return length * 8;
}

/** Same single-mode choice the qrdx encoder makes for a whole string. */
export function detectMode(text: string): EncodingMode {
  if (NUMERIC_REGEX.test(text)) return "numeric";
  if (ALPHANUMERIC_REGEX.test(text)) return "alphanumeric";
  return "byte";
}

/** Characters (numeric/alphanumeric) or UTF-8 bytes (byte mode). */
export function getEncodedLength(text: string, mode: EncodingMode): number {
  return mode === "byte" ? new TextEncoder().encode(text).length : text.length;
}

function fits(
  mode: EncodingMode,
  length: number,
  version: number,
  ecc: EccLevel,
): boolean {
  const ccBits = charCountBits(mode, version);
  if (length >= 2 ** ccBits) return false;
  return (
    4 + ccBits + payloadBits(mode, length) <= getDataCapacityBits(version, ecc)
  );
}

/** Maximum characters (or bytes in byte mode) a version can hold. */
export function getCapacity(
  version: number,
  ecc: EccLevel,
  mode: EncodingMode,
): number {
  assertVersion(version);
  let low = 0;
  let high = 7089;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mode, mid, version, ecc)) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** Smallest version that holds `text`, or null if it is too long for a QR code. */
export function getMinVersion(text: string, ecc: EccLevel): number | null {
  const mode = detectMode(text);
  const length = getEncodedLength(text, mode);
  for (let version = MIN_VERSION; version <= MAX_VERSION; version++) {
    if (fits(mode, length, version, ecc)) return version;
  }
  return null;
}

export function toMillimeters(value: number, unit: DistanceUnit): number {
  return value * MM_PER_UNIT[unit];
}

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

/** Pixels needed to print `mm` at a given resolution (dots per inch). */
export function pixelsForPrint(mm: number, dpi = 300): number {
  return Math.ceil(mmToInches(mm) * dpi);
}

export interface PrintSizeInput {
  /** Expected scanning distance in millimetres. */
  distanceMm: number;
  /** Modules per side, without the quiet zone (17 + 4 x version). */
  modules: number;
}

export interface PrintSizeResult {
  /** Plain distance / 10 rule of thumb, for comparison. */
  ruleOfThumbMm: number;
  /** Size of one module. */
  moduleMm: number;
  /** Printed code, edge to edge, without the quiet zone. */
  symbolMm: number;
  /** Code plus the 4-module quiet zone on every side. */
  totalMm: number;
  /** Which constraint set the module size. */
  limitedBy: "distance" | "minimum-module";
}

/**
 * Minimum printed size for a code to scan from `distanceMm`.
 * Module size = max(distance / (10 x 25), 0.4 mm), then x modules per side.
 */
export function calculatePrintSize({
  distanceMm,
  modules,
}: PrintSizeInput): PrintSizeResult {
  if (!(distanceMm > 0) || !Number.isFinite(distanceMm)) {
    throw new RangeError("Scanning distance must be a positive number");
  }
  if (!Number.isInteger(modules) || modules < 21 || modules > 177) {
    throw new RangeError("Module count must be between 21 and 177");
  }

  const fromDistance =
    distanceMm / (DISTANCE_TO_SIZE_RATIO * REFERENCE_MODULES);
  const moduleMm = Math.max(fromDistance, MIN_MODULE_MM);

  return {
    ruleOfThumbMm: distanceMm / DISTANCE_TO_SIZE_RATIO,
    moduleMm,
    symbolMm: moduleMm * modules,
    totalMm: moduleMm * (modules + QUIET_ZONE_MODULES * 2),
    limitedBy: fromDistance >= MIN_MODULE_MM ? "distance" : "minimum-module",
  };
}
