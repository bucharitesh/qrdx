// NFC links (lib/nfc/links.ts) and Web NFC errors (lib/nfc/web-nfc.ts): a
// code's NFC link is its short link with `?nfc`, the marker decides whether
// a visit is stored as a tap, and plain short links stay QR scans.
import { describe, expect, it } from "vitest";
import {
  NFC_TAGS,
  ndefUrlBytes,
  nfcLink,
  normalizeScanSource,
  scanSourceOf,
} from "@/lib/nfc/links";
import {
  classifyNfcError,
  NFC_FAILURE_MESSAGES,
  type NfcFailure,
} from "@/lib/nfc/web-nfc";

describe("nfcLink", () => {
  it("adds ?nfc to default and custom-domain short links", () => {
    expect(nfcLink("https://qrdx.dev/q/aB3dE5f")).toBe(
      "https://qrdx.dev/q/aB3dE5f?nfc",
    );
    expect(nfcLink("https://go.brand.com/spring-menu")).toBe(
      "https://go.brand.com/spring-menu?nfc",
    );
  });

  it("keeps an existing query and doesn't add the marker twice", () => {
    expect(nfcLink("https://qrdx.dev/q/aB3dE5f?x=1")).toBe(
      "https://qrdx.dev/q/aB3dE5f?x=1&nfc",
    );
    expect(nfcLink("https://qrdx.dev/q/aB3dE5f?nfc")).toBe(
      "https://qrdx.dev/q/aB3dE5f?nfc",
    );
  });

  it("is read back as an NFC visit", () => {
    const link = nfcLink("https://go.brand.com/menu");
    expect(scanSourceOf(link)).toBe("nfc");
  });
});

describe("scanSourceOf", () => {
  it("counts plain short links as QR scans", () => {
    for (const url of [
      "https://qrdx.dev/q/aB3dE5f",
      "https://go.brand.com/menu",
      "https://qrdx.dev/q/aB3dE5f?utm_source=flyer",
      "https://qrdx.dev/q/aB3dE5f?nfcx",
      "https://qrdx.dev/q/aB3dE5f?NFC",
    ]) {
      expect(scanSourceOf(url), url).toBe("qr");
    }
  });

  it("counts the marker with or without a value, anywhere in the query", () => {
    for (const url of [
      "https://qrdx.dev/q/aB3dE5f?nfc",
      "https://qrdx.dev/q/aB3dE5f?nfc=",
      "https://qrdx.dev/q/aB3dE5f?nfc=1",
      "https://qrdx.dev/q/aB3dE5f?a=b&nfc",
    ]) {
      expect(scanSourceOf(url), url).toBe("nfc");
    }
  });

  it("takes URL objects and relative paths", () => {
    expect(scanSourceOf(new URL("http://localhost:3000/q/Menu123?nfc"))).toBe(
      "nfc",
    );
    expect(scanSourceOf("/q/Menu123")).toBe("qr");
  });
});

describe("normalizeScanSource", () => {
  it("reads rows from before sources were stored as QR scans", () => {
    expect(normalizeScanSource(null)).toBe("qr");
    expect(normalizeScanSource(undefined)).toBe("qr");
    expect(normalizeScanSource("qr")).toBe("qr");
    expect(normalizeScanSource("nfc")).toBe("nfc");
    expect(normalizeScanSource("other")).toBe("qr");
  });
});

describe("tag sizes", () => {
  it("counts an NDEF URL record with the https:// prefix code", () => {
    // TLV (2) + record header, type and payload length (4) + prefix code (1)
    // + "qrdx.dev/q/aB3dE5f?nfc" (22) + terminator (1)
    expect(ndefUrlBytes("https://qrdx.dev/q/aB3dE5f?nfc")).toBe(30);
    // "https://www." is one prefix code too.
    expect(ndefUrlBytes("https://www.brand.com/m?nfc")).toBe(
      ndefUrlBytes("https://brand.com/m?nfc"),
    );
  });

  it("grows past an NTAG213 for long links", () => {
    const fits = (url: string) =>
      NFC_TAGS.filter((tag) => tag.bytes >= ndefUrlBytes(url)).map(
        (tag) => tag.name,
      );
    expect(fits("https://qrdx.dev/q/aB3dE5f?nfc")).toEqual([
      "NTAG213",
      "NTAG215",
      "NTAG216",
    ]);
    const long = `https://${"a".repeat(60)}.example.com/${"b".repeat(100)}?nfc`;
    expect(ndefUrlBytes(long)).toBe(185);
    expect(fits(long)).toEqual(["NTAG215", "NTAG216"]);
    // Over 255 payload bytes the record and TLV lengths take 3 more each.
    expect(ndefUrlBytes(`https://x.com/${"c".repeat(900)}`)).toBe(919);
    expect(fits(`https://x.com/${"c".repeat(900)}`)).toEqual([]);
  });

  it("lists tags smallest first", () => {
    const sizes = NFC_TAGS.map((tag) => tag.bytes);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });
});

describe("classifyNfcError", () => {
  const error = (name: string, message = "") =>
    Object.assign(new Error(message), { name });

  it("sorts Web NFC errors into what the person can do", () => {
    const cases: [unknown, NfcFailure][] = [
      [error("AbortError"), "aborted"],
      [
        error("NotAllowedError", "NFC permission request denied."),
        "permission",
      ],
      [error("NotReadableError", "NFC setting is disabled."), "disabled"],
      [error("NotSupportedError", "NFC is not supported."), "unsupported"],
      [
        error("NetworkError", "Failed to write because the tag is lost"),
        "connection",
      ],
      [error("NetworkError", "Failed to write: tag is read-only"), "locked"],
      [error("NotAllowedError", "The tag is read only"), "locked"],
      [
        error("NetworkError", "NDEF message too large for the tag"),
        "too-small",
      ],
      [error("TypeError"), "unknown"],
      ["not an error", "unknown"],
      [null, "unknown"],
    ];
    for (const [input, expected] of cases) {
      expect(classifyNfcError(input), String(input)).toBe(expected);
    }
  });

  it("has a message for every failure", () => {
    for (const message of Object.values(NFC_FAILURE_MESSAGES)) {
      expect(message.title).not.toBe("");
      expect(message.description).not.toBe("");
    }
  });
});
