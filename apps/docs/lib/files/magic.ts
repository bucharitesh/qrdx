import { type AllowedMime, type FileKind, kindForMime } from "./types";

/**
 * Content sniffing for uploads: the first bytes of a file tell what it really
 * is, whatever its name or declared type says. A file is accepted when its
 * signature belongs to the same kind (pdf, image, audio, video) as its
 * declared MIME type, so a PNG named .jpg passes and an HTML page named .pdf
 * does not.
 */

/** Bytes to read from the start of a file before sniffing. */
export const SNIFF_BYTES = 4096;

export type SniffedType =
  | "pdf"
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "avif"
  | "heif"
  | "mp3"
  | "aac"
  | "id3"
  | "flac"
  | "wav"
  | "ogg"
  | "webm"
  | "isobmff"
  | "quicktime";

const SNIFFED_KINDS: Record<SniffedType, readonly FileKind[]> = {
  pdf: ["pdf"],
  jpeg: ["image"],
  png: ["image"],
  gif: ["image"],
  webp: ["image"],
  avif: ["image"],
  // HEIC/HEIF photos don't display outside Safari: never accepted
  heif: [],
  mp3: ["audio"],
  aac: ["audio"],
  // ID3 tags precede MP3 and AAC streams
  id3: ["audio"],
  flac: ["audio"],
  wav: ["audio"],
  ogg: ["audio"],
  webm: ["video"],
  // MP4 / M4A / most MOV files
  isobmff: ["audio", "video"],
  quicktime: ["video"],
};

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  bytes.length >= signature.length &&
  signature.every((byte, index) => bytes[index] === byte);

function indexOfAscii(bytes: Uint8Array, needle: string, limit: number) {
  const end = Math.min(bytes.length, limit) - needle.length;
  outer: for (let i = 0; i <= end; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "mif1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);
// Atoms that can open a QuickTime file written without an `ftyp` box
const QUICKTIME_ATOMS = new Set(["moov", "mdat", "wide", "free", "skip"]);

/** ISO base media (`ftyp` box): image (AVIF/HEIF) or audio/video container. */
function sniffFtyp(bytes: Uint8Array): SniffedType {
  const major = ascii(bytes, 8, 4);
  if (AVIF_BRANDS.has(major)) return "avif";
  if (HEIF_BRANDS.has(major)) return "heif";
  if (major === "qt  ") return "quicktime";
  return "isobmff";
}

/** What the bytes are, or null when they match no supported format. */
export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  if (bytes.length < 4) return null;

  // PDF readers accept the header anywhere in the first 1 KB.
  if (indexOfAscii(bytes, "%PDF-", 1024) !== -1) return "pdf";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  const head = ascii(bytes, 0, 4);
  if (head === "GIF8" && /^GIF8[79]a$/.test(ascii(bytes, 0, 6))) return "gif";
  if (head === "RIFF" && bytes.length >= 12) {
    const format = ascii(bytes, 8, 4);
    if (format === "WEBP") return "webp";
    if (format === "WAVE") return "wav";
    return null;
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    return sniffFtyp(bytes);
  }
  if (bytes.length >= 8 && QUICKTIME_ATOMS.has(ascii(bytes, 4, 4))) {
    return "quicktime";
  }
  if (head === "OggS") return "ogg";
  if (head === "fLaC") return "flac";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    // EBML: WebM declares its DocType early; plain Matroska is not accepted.
    return indexOfAscii(bytes, "webm", 64) !== -1 ? "webm" : null;
  }
  if (ascii(bytes, 0, 3) === "ID3") return "id3";
  const [b0, b1 = 0] = bytes;
  if (b0 === 0xff) {
    // ADTS AAC: sync word 0xFFF, layer bits 00
    if ((b1 & 0xf6) === 0xf0) return "aac";
    // MPEG audio frame: 11-bit sync, layer bits not 00
    if ((b1 & 0xe0) === 0xe0 && (b1 & 0x06) !== 0) return "mp3";
  }
  return null;
}

/** True when the file's first bytes fit the kind of its declared type. */
export function matchesDeclaredType(
  mime: AllowedMime,
  bytes: Uint8Array,
): boolean {
  const sniffed = sniffFileType(bytes);
  return sniffed ? SNIFFED_KINDS[sniffed].includes(kindForMime(mime)) : false;
}
