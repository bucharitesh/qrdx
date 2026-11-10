import type { ScanSource } from "@repo/database";

// NFC links: a dynamic code's short link with `?nfc` on the end
// (`qrdx.dev/q/aB3dE5f?nfc`, `go.brand.com/menu?nfc`). The redirect is the
// same as the short link's; the marker only tells analytics the visit came
// from a tap on an NFC tag or card rather than a QR scan. Plain short links
// (every printed QR code) resolve and count exactly as before.
// Client-safe: no server imports.

/** The query marker of an NFC link. */
export const NFC_PARAM = "nfc";

/** The code's NFC link: its short link with `?nfc` (or `&nfc`) added. */
export function nfcLink(shortLink: string): string {
  const url = new URL(shortLink);
  if (url.searchParams.has(NFC_PARAM)) return shortLink;
  const hash = url.hash;
  const base = hash ? shortLink.slice(0, -hash.length) : shortLink;
  return `${base}${url.search ? "&" : "?"}${NFC_PARAM}${hash}`;
}

/** Whether a short-link request came through the NFC link. */
export function scanSourceOf(url: URL | string): ScanSource {
  const parsed =
    typeof url === "string" ? new URL(url, "https://qrdx.invalid") : url;
  return parsed.searchParams.has(NFC_PARAM) ? "nfc" : "qr";
}

/** A stored source as shown and exported: rows from before sources were stored are QR scans. */
export function normalizeScanSource(
  value: string | null | undefined,
): ScanSource {
  return value === "nfc" ? "nfc" : "qr";
}

export const SCAN_SOURCE_LABELS: Record<ScanSource, string> = {
  qr: "QR scans",
  nfc: "NFC taps",
};

// ─── Tag sizes ───────────────────────────────────────────────────────────────

/** NFC Forum URI identifier codes that shorten a URL record. */
const URI_PREFIXES = ["https://www.", "http://www.", "https://", "http://"];

/**
 * Bytes an NDEF message with one URL record takes on a tag: the TLV wrapper,
 * the record header, the "U" type, the prefix code and the rest of the URL in
 * UTF-8, plus the terminator. Phones write URL records this way.
 */
export function ndefUrlBytes(url: string): number {
  const prefix = URI_PREFIXES.find((value) => url.startsWith(value));
  const rest = prefix ? url.slice(prefix.length) : url;
  const payload = 1 + new TextEncoder().encode(rest).length;
  // Flags + type length + payload length (1 byte up to 255, else 4) + "U".
  const record = 4 + (payload > 255 ? 3 : 0) + payload;
  // TLV type + length (1 byte up to 254, else 3) + the message + terminator.
  return 1 + (record > 254 ? 3 : 1) + record + 1;
}

/** Common NFC tags and the bytes they hold for data (user memory). */
export const NFC_TAGS = [
  { name: "NTAG213", bytes: 144 },
  { name: "NTAG215", bytes: 504 },
  { name: "NTAG216", bytes: 888 },
] as const;
