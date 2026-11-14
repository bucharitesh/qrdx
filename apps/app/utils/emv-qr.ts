// EMV merchant-presented QR payloads (EMVCo QRCPS-MPM), the format behind
// Pix, PayNow, PromptPay and VietQR: a string of TLV data objects, each a
// 2-digit ID, a 2-digit length and the value, ending with a CRC16-CCITT
// checksum in ID 63. Templates (merchant account information, additional
// data) nest TLVs inside a value. Pure, so it runs in the browser, on the
// server and in tests.

/** One data object: an ID and a value, or a template of nested objects. */
export type EmvObject = [id: string, value: string | EmvObject[]];

/** The ID of the checksum object, always last. */
export const EMV_CRC_ID = "63";

/** Longest value one data object can hold (a 2-digit length). */
export const EMV_MAX_VALUE_LENGTH = 99;

const utf8 = new TextEncoder();

/**
 * CRC-16/CCITT-FALSE (polynomial 0x1021, initial value 0xFFFF, no reflection,
 * no final XOR) over the UTF-8 bytes, as 4 uppercase hex digits. EMV codes
 * compute it over the whole payload up to and including "6304".
 */
export function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of utf8.encode(input)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export class EmvLengthError extends Error {
  readonly id: string;
  constructor(id: string, length: number) {
    super(
      `EMV data object ${id} is ${length} characters long; the most is ${EMV_MAX_VALUE_LENGTH}`,
    );
    this.id = id;
    this.name = "EmvLengthError";
  }
}

/** One TLV: ID, 2-digit length, value. Throws when the value is too long. */
export function emvTlv(id: string, value: string): string {
  if (!/^\d{2}$/.test(id))
    throw new Error(`Invalid EMV data object ID "${id}"`);
  const length = [...value].length;
  if (length > EMV_MAX_VALUE_LENGTH) throw new EmvLengthError(id, length);
  return `${id}${String(length).padStart(2, "0")}${value}`;
}

/** Objects serialized in the order given; empty values are left out. */
export function serializeEmv(objects: EmvObject[]): string {
  return objects
    .map(([id, value]) => {
      const text = typeof value === "string" ? value : serializeEmv(value);
      return text === "" ? "" : emvTlv(id, text);
    })
    .join("");
}

/**
 * A complete payload: the objects (Payload Format Indicator "00" first, as
 * the spec requires), then the CRC in ID 63.
 */
export function buildEmvPayload(objects: EmvObject[]): string {
  const body = `${serializeEmv(objects)}${EMV_CRC_ID}04`;
  return `${body}${crc16Ccitt(body)}`;
}

/** Splits a TLV string into [id, value] pairs; null when it isn't one. */
export function parseEmvObjects(input: string): [string, string][] | null {
  const chars = [...input];
  const objects: [string, string][] = [];
  let index = 0;
  while (index < chars.length) {
    const head = chars.slice(index, index + 4).join("");
    if (!/^\d{4}$/.test(head)) return null;
    const id = head.slice(0, 2);
    const length = Number(head.slice(2));
    const start = index + 4;
    if (start + length > chars.length) return null;
    objects.push([id, chars.slice(start, start + length).join("")]);
    index = start + length;
  }
  return objects;
}

export interface ParsedEmv {
  /** Top-level objects by ID (later duplicates win). */
  fields: Map<string, string>;
  /** Whether the CRC in ID 63 matches the payload. */
  crcValid: boolean;
}

/**
 * Reads an EMV merchant-presented payload: it must start with "000201" and
 * end with a 4-character CRC object. Null when it doesn't parse.
 */
export function parseEmvPayload(raw: string): ParsedEmv | null {
  const value = raw.trim();
  if (!value.startsWith("000201")) return null;
  const objects = parseEmvObjects(value);
  if (!objects || objects.length < 2) return null;
  const last = objects.at(-1);
  if (!last || last[0] !== EMV_CRC_ID || last[1].length !== 4) return null;
  const crcValid =
    crc16Ccitt(value.slice(0, value.length - 4)) === last[1].toUpperCase();
  return { fields: new Map(objects), crcValid };
}

/** Nested objects of a template value as a map (empty when it doesn't parse). */
export function emvTemplate(value: string | undefined): Map<string, string> {
  return new Map(value ? (parseEmvObjects(value) ?? []) : []);
}

/**
 * Text for EMV name, city and message fields, which take printable ASCII:
 * accents dropped ("São Paulo" → "Sao Paulo", "Đà Nẵng" → "Da Nang"),
 * whitespace collapsed, anything else removed.
 */
export function toEmvText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7e]/g, "")
    .trim();
}

/**
 * An amount for ID 54: digits, then "." and exactly `decimals` decimals
 * ("12.5" → "12.50"), at most 13 characters. A decimal comma ("12,50") is
 * read as a point; thousands separators aren't accepted. Null when it
 * isn't an amount, or is zero.
 */
export function emvAmount(
  raw: string | undefined,
  decimals: number,
): string | null {
  let value = raw?.trim() ?? "";
  if (decimals > 0 && /^\d+,\d+$/.test(value)) value = value.replace(",", ".");
  const pattern =
    decimals > 0 ? new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`) : /^\d+$/;
  if (!pattern.test(value) || Number(value) <= 0) return null;
  const [whole = "", fraction = ""] = value.split(".");
  const digits = whole.replace(/^0+(?=\d)/, "");
  const formatted =
    decimals > 0 ? `${digits}.${fraction.padEnd(decimals, "0")}` : digits;
  return formatted.length <= 13 ? formatted : null;
}
