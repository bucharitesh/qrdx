// The barcode generator's symbologies and the input rules for each: allowed
// characters, lengths and check digits. Pure data and string checks, with no
// renderer: lib/product-facts.ts counts BARCODE_FORMATS, and the page imports
// this module without loading bwip-js (lib/barcode/render.ts does that).

import { CANONICAL_ORIGIN } from "@repo/config";
export type BarcodeFormatId =
  | "ean13"
  | "ean8"
  | "upca"
  | "upce"
  | "code128"
  | "code39"
  | "itf14"
  | "gs1-128"
  | "datamatrix"
  | "pdf417"
  | "aztec";

export interface BarcodeFormat {
  id: BarcodeFormatId;
  label: string;
  /** Linear (1D) codes have bars, a bar height and printed digits. */
  kind: "linear" | "2d";
  /** One line for the format picker */
  summary: string;
  /** A valid value to start from */
  example: string;
  /** What the input takes, shown under the field */
  inputHint: string;
  /**
   * Blank margin in modules (the narrowest bar, or one 2D cell): the
   * symbology's minimum and the default the generator starts with.
   */
  quietZone: { min: number; default: number };
  /** Default bar height in millimetres (linear codes) */
  barHeightMm?: number;
  /** Longest input the field takes, in characters */
  maxLength: number;
  /** BarcodeDetector format names a reader reports for this symbology */
  detectorFormats: readonly string[];
}

/** Every symbology the generator draws, in picker order. */
export const BARCODE_FORMATS: readonly BarcodeFormat[] = [
  {
    id: "ean13",
    label: "EAN-13",
    kind: "linear",
    summary: "Retail products sold worldwide",
    example: "5901234123457",
    inputHint:
      "12 digits, and the check digit is added, or all 13 to have it checked.",
    quietZone: { min: 11, default: 11 },
    barHeightMm: 23,
    maxLength: 20,
    detectorFormats: ["ean_13"],
  },
  {
    id: "ean8",
    label: "EAN-8",
    kind: "linear",
    summary: "Small retail packs",
    example: "96385074",
    inputHint:
      "7 digits, and the check digit is added, or all 8 to have it checked.",
    quietZone: { min: 7, default: 7 },
    barHeightMm: 18,
    maxLength: 12,
    detectorFormats: ["ean_8"],
  },
  {
    id: "upca",
    label: "UPC-A",
    kind: "linear",
    summary: "Retail products in the US and Canada",
    example: "036000291452",
    inputHint:
      "11 digits, and the check digit is added, or all 12 to have it checked.",
    quietZone: { min: 9, default: 11 },
    barHeightMm: 23,
    maxLength: 16,
    detectorFormats: ["upc_a", "ean_13"],
  },
  {
    id: "upce",
    label: "UPC-E",
    kind: "linear",
    summary: "A UPC-A number shortened for small packs",
    example: "06543217",
    inputHint:
      "6 to 8 digits (number system 0 or 1, six digits, check digit), or a 12-digit UPC-A that can be shortened.",
    quietZone: { min: 9, default: 9 },
    barHeightMm: 23,
    maxLength: 16,
    detectorFormats: ["upc_e"],
  },
  {
    id: "code128",
    label: "Code 128",
    kind: "linear",
    summary: "Letters, digits and symbols: labels, tickets, inventory",
    example: "QRDX-2026-0042",
    inputHint:
      "Up to 80 letters, digits, spaces and keyboard symbols (plain ASCII, no accents or emoji).",
    quietZone: { min: 10, default: 10 },
    barHeightMm: 15,
    maxLength: 80,
    detectorFormats: ["code_128"],
  },
  {
    id: "code39",
    label: "Code 39",
    kind: "linear",
    summary: "Capital letters and digits for older scanners",
    example: "QRDX-39",
    inputHint: "Up to 40 capital letters, digits, spaces and - . $ / + %.",
    quietZone: { min: 10, default: 10 },
    barHeightMm: 15,
    maxLength: 40,
    detectorFormats: ["code_39"],
  },
  {
    id: "itf14",
    label: "ITF-14",
    kind: "linear",
    summary: "Shipping cartons holding retail products",
    example: "15400141288763",
    inputHint:
      "13 digits, and the check digit is added, or all 14 to have it checked.",
    // The bearer frame BWIPP draws already holds the 10-module quiet zone.
    quietZone: { min: 0, default: 4 },
    barHeightMm: 25,
    maxLength: 20,
    detectorFormats: ["itf"],
  },
  {
    id: "gs1-128",
    label: "GS1-128",
    kind: "linear",
    summary: "Supply chain data: GTIN, batch, dates, weights",
    example: "(01)09501101530003(17)261231(10)AB-123",
    inputHint:
      "Application Identifiers in brackets, each followed by its value, e.g. (01)09501101530003(10)AB-123.",
    quietZone: { min: 10, default: 10 },
    barHeightMm: 15,
    maxLength: 120,
    detectorFormats: ["code_128"],
  },
  {
    id: "datamatrix",
    label: "Data Matrix",
    kind: "2d",
    summary: "Small square 2D code for parts and labels",
    example: CANONICAL_ORIGIN,
    inputHint: "Any text up to 1,000 characters.",
    quietZone: { min: 1, default: 2 },
    maxLength: 1000,
    detectorFormats: ["data_matrix"],
  },
  {
    id: "pdf417",
    label: "PDF417",
    kind: "2d",
    summary: "Stacked 2D code for IDs, boarding passes and documents",
    example: "QRdx PDF417 sample",
    inputHint: "Any text up to 1,000 characters.",
    quietZone: { min: 2, default: 2 },
    maxLength: 1000,
    detectorFormats: ["pdf417"],
  },
  {
    id: "aztec",
    label: "Aztec",
    kind: "2d",
    summary: "2D code that needs no margin: tickets and transport",
    example: "QRdx Aztec sample",
    inputHint: "Any text up to 1,000 characters.",
    quietZone: { min: 0, default: 2 },
    maxLength: 1000,
    detectorFormats: ["aztec"],
  },
];

export const DEFAULT_BARCODE_FORMAT: BarcodeFormatId = "ean13";

export function getBarcodeFormat(id: BarcodeFormatId): BarcodeFormat {
  const format = BARCODE_FORMATS.find((item) => item.id === id);
  if (!format) throw new Error(`Unknown barcode format "${id}"`);
  return format;
}

export function isBarcodeFormatId(value: string): value is BarcodeFormatId {
  return BARCODE_FORMATS.some((format) => format.id === value);
}

/**
 * Why a value can't be drawn, or what was changed, as a stable code and its
 * values. The API sends the English text (`error`, `note`); the generator
 * shows the visitor's language by code (messages: barcodeTool.issues).
 */
export const BARCODE_ISSUE_CODES = [
  "enterDigits",
  "digitsOnly",
  "checkDigitAdded",
  "wrongCheckDigit",
  "wrongLength",
  "upceEnter",
  "upceSystem",
  "upceNoForm",
  "shortenedFromUpca",
  "numberSystemAssumed",
  "upceLength",
  "upceStart",
  "enterText",
  "tooLong",
  "code128Chars",
  "code39Chars",
  "code39Lowercase",
  "gs1Enter",
  "gs1Start",
  "gs1Brackets",
  "gs1BadAi",
  "gs1NoValue",
  "gs1BadChars",
  "gs1Ai",
  "gs1TooLong",
  "unknownFormat",
] as const;

export type BarcodeIssueCode = (typeof BARCODE_ISSUE_CODES)[number];

export interface BarcodeIssue {
  code: BarcodeIssueCode;
  values?: Record<string, string | number>;
  /** Characters that aren't allowed, up to six (" " a space, "\n" a line break) */
  chars?: string[];
  /** gs1Ai: the problem (or note) about that AI's value */
  inner?: BarcodeIssue;
}

export type BarcodeInput =
  | {
      ok: true;
      /** What the encoder gets: the full number with its check digit, etc. */
      value: string;
      /** A note about what was added or changed ("Check digit 7 added.") */
      note?: string;
      /** The same, as codes */
      notes?: BarcodeIssue[];
    }
  | { ok: false; error: string; issue: BarcodeIssue };

const digitCount = (n: number | string) =>
  `${n} digit${Number(n) === 1 ? "" : "s"}`;
const count = (n: number | string) => Number(n).toLocaleString("en-US");
const englishChars = (chars: readonly string[] = []) =>
  chars
    .map((char) =>
      char === " " ? "space" : char.trim() ? char : "a line break",
    )
    .join(" ");

/** The English text of an issue (the API's `error` and `note`). */
export function barcodeIssueText(issue: BarcodeIssue): string {
  const v = issue.values ?? {};
  switch (issue.code) {
    case "enterDigits":
      return `Enter ${v.short} digits, or all ${v.length} with the check digit.`;
    case "digitsOnly":
      return `${v.label} takes digits only.`;
    case "checkDigitAdded":
      return `Check digit ${v.check} added.`;
    case "wrongCheckDigit":
      return `The check digit should be ${v.expected}, not ${v.given}. Check the number, or leave the last digit off and it's worked out for you.`;
    case "wrongLength":
      return `${v.label} needs ${v.short} or ${v.length} digits; this has ${digitCount(v.count ?? 0)}.`;
    case "upceEnter":
      return "Enter 6 to 8 digits, or a 12-digit UPC-A to shorten.";
    case "upceSystem":
      return "Only UPC-A numbers starting with 0 or 1 have a UPC-E form. Use UPC-A instead.";
    case "upceNoForm":
      return "This UPC-A number has no UPC-E form: only numbers with zeros in the right places can be shortened. Use UPC-A instead.";
    case "shortenedFromUpca":
      return `Shortened from UPC-A ${v.upca}.`;
    case "numberSystemAssumed":
      return "Number system 0 assumed.";
    case "upceLength":
      return `UPC-E needs 6, 7 or 8 digits (or a 12-digit UPC-A); this has ${digitCount(v.count ?? 0)}.`;
    case "upceStart":
      return "A UPC-E number starts with number system 0 or 1.";
    case "enterText":
      return "Enter the text to encode.";
    case "tooLong":
      return `${v.label} here takes up to ${count(v.max ?? 0)} characters; this has ${count(v.count ?? 0)}.`;
    case "code128Chars":
      return `Code 128 here takes plain ASCII letters, digits, spaces and symbols. Not allowed: ${englishChars(issue.chars)}`;
    case "code39Chars":
      return `Code 39 takes capital letters, digits, spaces and - . $ / + % only. Not allowed: ${englishChars(issue.chars)}`;
    case "code39Lowercase":
      return "Code 39 has no lowercase letters. Use capitals, or Code 128 for mixed case.";
    case "gs1Enter":
      return "Enter Application Identifiers in brackets with their values, e.g. (01)09501101530003.";
    case "gs1Start":
      return "Start with an Application Identifier in brackets, e.g. (01) for a GTIN, then its value.";
    case "gs1Brackets":
      return "Brackets don't line up: write each AI as (digits), followed by its value.";
    case "gs1BadAi":
      return `"(${v.ai})" isn't an Application Identifier: AIs are 2 to 4 digits.`;
    case "gs1NoValue":
      return `AI (${v.ai}) has no value after it.`;
    case "gs1BadChars":
      return `AI (${v.ai}) has characters GS1 doesn't allow: ${englishChars(issue.chars)}`;
    case "gs1Ai":
      return `AI (${v.ai}): ${issue.inner ? barcodeIssueText(issue.inner) : ""}`;
    case "gs1TooLong":
      return `GS1-128 holds up to ${v.max} characters of AIs and data; this has ${v.count}. Split it over two barcodes.`;
    case "unknownFormat":
      return "Unknown barcode format.";
  }
}

const fail = (issue: BarcodeIssue): BarcodeInput => ({
  ok: false,
  error: barcodeIssueText(issue),
  issue,
});

/** A success with notes: `note` is their English text, joined. */
const done = (value: string, notes: BarcodeIssue[] = []): BarcodeInput =>
  notes.length > 0
    ? { ok: true, value, note: notes.map(barcodeIssueText).join(" "), notes }
    : { ok: true, value };

/**
 * The GS1 check digit (EAN, UPC, ITF-14, GTIN, SSCC): weights 3 and 1
 * alternate from the rightmost digit of `body`, and the check digit brings
 * the sum up to a multiple of 10.
 */
export function gs1CheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) {
    throw new Error("A GS1 check digit needs digits only");
  }
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * A GS1 number of `length` digits: one digit short gets its check digit,
 * the full length has its check digit verified.
 */
function gs1Number(label: string, raw: string, length: number): BarcodeInput {
  const digits = raw.replace(/[\s-]/g, "");
  if (!digits) {
    return fail({
      code: "enterDigits",
      values: { short: length - 1, length },
    });
  }
  if (!/^\d+$/.test(digits)) {
    return fail({ code: "digitsOnly", values: { label } });
  }
  if (digits.length === length - 1) {
    const check = gs1CheckDigit(digits);
    return done(digits + check, [
      { code: "checkDigitAdded", values: { check } },
    ]);
  }
  if (digits.length === length) {
    const expected = gs1CheckDigit(digits.slice(0, -1));
    const given = Number(digits.at(-1));
    if (expected !== given) {
      return fail({ code: "wrongCheckDigit", values: { expected, given } });
    }
    return done(digits);
  }
  return fail({
    code: "wrongLength",
    values: { label, short: length - 1, length, count: digits.length },
  });
}

/** A UPC-E number (number system, six digits, check digit) as its UPC-A. */
export function expandUpce(upce: string): string {
  if (!/^[01]\d{6}\d?$/.test(upce)) {
    throw new Error("UPC-E needs number system 0 or 1 and six digits");
  }
  const ns = upce[0] as string;
  const d = upce.slice(1, 7);
  const last = Number(d[5]);
  let body: string;
  if (last <= 2) body = `${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
  else if (last === 3) body = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  else if (last === 4) body = `${d.slice(0, 4)}00000${d[4]}`;
  else body = `${d.slice(0, 5)}0000${last}`;
  const upca = ns + body;
  return upca + gs1CheckDigit(upca);
}

/**
 * The UPC-E form of a 12-digit UPC-A, or null when the number has no UPC-E
 * form (only some manufacturer and product numbers can be shortened).
 */
export function compressUpca(upca: string): string | null {
  if (!/^[01]\d{11}$/.test(upca)) return null;
  const ns = upca[0] as string;
  const m = upca.slice(1, 6);
  const p = upca.slice(6, 11);
  const check = upca[11] as string;
  const candidates = [
    // Manufacturer ends in 000, 100 or 200; product 00000-00999
    `${m.slice(0, 2)}${p.slice(2, 5)}${m[2]}`,
    // Manufacturer ends in 00; product 00000-00099
    `${m.slice(0, 3)}${p.slice(3, 5)}3`,
    // Manufacturer ends in 0; product 00000-00009
    `${m.slice(0, 4)}${p[4]}4`,
    // Product 00005-00009
    `${m}${p[4]}`,
  ];
  for (const body of candidates) {
    const upce = `${ns}${body}${check}`;
    if (expandUpce(upce) === upca) return upce;
  }
  return null;
}

function upceInput(raw: string): BarcodeInput {
  const digits = raw.replace(/[\s-]/g, "");
  if (!digits) {
    return fail({ code: "upceEnter" });
  }
  if (!/^\d+$/.test(digits)) {
    return fail({ code: "digitsOnly", values: { label: "UPC-E" } });
  }

  if (digits.length === 11 || digits.length === 12) {
    const upca = gs1Number("UPC-A", digits, 12);
    if (!upca.ok) return upca;
    if (!/^[01]/.test(upca.value)) {
      return fail({ code: "upceSystem" });
    }
    const upce = compressUpca(upca.value);
    if (!upce) {
      return fail({ code: "upceNoForm" });
    }
    return done(upce, [
      { code: "shortenedFromUpca", values: { upca: upca.value } },
    ]);
  }

  let withSystem = digits;
  const notes: BarcodeIssue[] = [];
  if (digits.length === 6) {
    withSystem = `0${digits}`;
    notes.push({ code: "numberSystemAssumed" });
  }
  if (withSystem.length !== 7 && withSystem.length !== 8) {
    return fail({ code: "upceLength", values: { count: digits.length } });
  }
  if (!/^[01]/.test(withSystem)) {
    return fail({ code: "upceStart" });
  }
  const expected = gs1CheckDigit(expandUpce(withSystem).slice(0, 11));
  if (withSystem.length === 7) {
    return done(withSystem + expected, [
      ...notes,
      { code: "checkDigitAdded", values: { check: expected } },
    ]);
  }
  const given = Number(withSystem[7]);
  if (given !== expected) {
    return fail({ code: "wrongCheckDigit", values: { expected, given } });
  }
  return done(withSystem, notes);
}

/** Characters outside `allowed`, each listed once (up to six), for an issue. */
function offending(text: string, allowed: RegExp): string[] {
  const bad = [...new Set([...text].filter((char) => !allowed.test(char)))];
  return bad
    .slice(0, 6)
    .map((char) => (char.trim() || char === " " ? char : "\n"));
}

const CODE128_CHAR = /^[\x20-\x7e]$/;
const CODE39_CHAR = /^[0-9A-Z \-.$/+%]$/;

function textInput(
  format: BarcodeFormat,
  raw: string,
  allowed: { chars: RegExp; code: "code128Chars" | "code39Chars" } | null,
): BarcodeInput {
  if (!raw) return fail({ code: "enterText" });
  const length = [...raw].length;
  if (length > format.maxLength) {
    return fail({
      code: "tooLong",
      values: { label: format.label, max: format.maxLength, count: length },
    });
  }
  if (allowed && [...raw].some((char) => !allowed.chars.test(char))) {
    return fail({ code: allowed.code, chars: offending(raw, allowed.chars) });
  }
  return done(raw);
}

/** GS1 Application Identifiers whose value is a fixed-length number with a check digit. */
const GS1_CHECKED_AIS: Record<string, { name: string; length: number }> = {
  "00": { name: "SSCC", length: 18 },
  "01": { name: "GTIN", length: 14 },
  "02": { name: "GTIN", length: 14 },
};

/** GS1's 82-character set for AI values, without the brackets used to mark AIs. */
const GS1_VALUE = /^[!"%&'*+,\-./0-9:;<=>?A-Z_a-z]$/;

/** The GS separator readers put between variable-length GS1 fields. */
const GS = String.fromCharCode(0x1d);

/** A GS1-128 symbol holds at most 48 data characters. */
export const GS1_128_MAX_DATA = 48;

function gs1Input(raw: string): BarcodeInput {
  const text = raw.replace(/\s+/g, "");
  if (!text) {
    return fail({ code: "gs1Enter" });
  }
  if (!text.startsWith("(")) {
    return fail({ code: "gs1Start" });
  }
  const parts: string[] = [];
  const notes: BarcodeIssue[] = [];
  let dataLength = 0;
  const pattern = /\((\d*)\)([^()]*)/y;
  let index = 0;
  while (index < text.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(text);
    if (!match) {
      return fail({ code: "gs1Brackets" });
    }
    index = pattern.lastIndex;
    const ai = match[1] as string;
    let value = match[2] as string;
    if (!/^\d{2,4}$/.test(ai)) {
      return fail({ code: "gs1BadAi", values: { ai } });
    }
    if (!value) return fail({ code: "gs1NoValue", values: { ai } });
    const bad = [...value].filter((char) => !GS1_VALUE.test(char));
    if (bad.length > 0) {
      return fail({
        code: "gs1BadChars",
        values: { ai },
        chars: offending(value, GS1_VALUE),
      });
    }
    const checked = GS1_CHECKED_AIS[ai];
    if (checked) {
      const number = gs1Number(
        `AI (${ai}) (${checked.name})`,
        value,
        checked.length,
      );
      if (!number.ok) {
        return fail({ code: "gs1Ai", values: { ai }, inner: number.issue });
      }
      for (const note of number.notes ?? []) {
        notes.push({ code: "gs1Ai", values: { ai }, inner: note });
      }
      value = number.value;
    }
    parts.push(`(${ai})${value}`);
    dataLength += ai.length + value.length;
  }
  if (dataLength > GS1_128_MAX_DATA) {
    return fail({
      code: "gs1TooLong",
      values: { max: GS1_128_MAX_DATA, count: dataLength },
    });
  }
  return done(parts.join(""), notes);
}

/** Checks `raw` for `format`; on success, the value the encoder draws. */
export function validateBarcodeInput(
  id: BarcodeFormatId,
  raw: string,
): BarcodeInput {
  const format = getBarcodeFormat(id);
  switch (id) {
    case "ean13":
      return gs1Number("EAN-13", raw, 13);
    case "ean8":
      return gs1Number("EAN-8", raw, 8);
    case "upca":
      return gs1Number("UPC-A", raw, 12);
    case "upce":
      return upceInput(raw);
    case "itf14":
      return gs1Number("ITF-14", raw, 14);
    case "code128":
      return textInput(format, raw, {
        chars: CODE128_CHAR,
        code: "code128Chars",
      });
    case "code39": {
      const onlyCaseIsWrong =
        /[a-z]/.test(raw) &&
        [...raw.toUpperCase()].every((char) => CODE39_CHAR.test(char));
      if (onlyCaseIsWrong) {
        return fail({ code: "code39Lowercase" });
      }
      return textInput(format, raw, {
        chars: CODE39_CHAR,
        code: "code39Chars",
      });
    }
    case "gs1-128":
      return gs1Input(raw);
    case "datamatrix":
    case "pdf417":
    case "aztec":
      return textInput(format, raw, null);
    default:
      return fail({ code: "unknownFormat" });
  }
}

/**
 * True when what a reader decoded is the value the generator drew. Readers
 * differ in how they report some symbologies: a UPC-A may come back as the
 * 13-digit EAN with a leading 0, a UPC-E as its expanded UPC-A (12 or 13
 * digits), and GS1-128 with or without brackets around the AIs and with
 * GS (0x1D) separators between fields.
 */
export function decodedMatches(
  id: BarcodeFormatId,
  value: string,
  decoded: string,
): boolean {
  switch (id) {
    case "upca":
      return decoded === value || decoded === `0${value}`;
    case "upce": {
      const upca = expandUpce(value);
      return decoded === value || decoded === upca || decoded === `0${upca}`;
    }
    case "gs1-128": {
      const plain = (text: string) =>
        text.replace(/^\]C1/, "").replace(/[()]/g, "").replaceAll(GS, "");
      return plain(decoded) === plain(value);
    }
    default:
      return decoded === value;
  }
}
