// Every QR content type's payload, checked against the format scanners expect:
// ZXing WIFI:, vCard 3.0 (RFC 2426 / RFC 6350 rules), mailto: (RFC 6068),
// tel: (RFC 3966, E.164), SMSTO:/sms: (RFC 5724), wa.me, Google Maps URLs with
// RFC 5870 coordinate ranges, NPCI UPI linking, BIP-21, EIP-681, and plain
// https URLs (WHATWG URL, IDNA for hosts).
import { describe, expect, it } from "vitest";
import {
  CONTENT_CATEGORIES,
  CONTENT_TYPES_METADATA,
  type QRContentConfig,
} from "@/types/qr-content";
import {
  encodeEmail,
  encodePhone,
  encodeQRContent,
  encodeSms,
  encodeVCard,
  encodeWhatsApp,
  encodeWifi,
  MAX_QR_PAYLOAD_BYTES,
  normalizePhone,
  normalizeWebUrl,
  validateContent,
} from "@/utils/qr-content-encoder";
import { SAMPLES } from "../support/samples";

const enc = (config: QRContentConfig) => encodeQRContent(config);

const ALL_TYPES = CONTENT_TYPES_METADATA.map((meta) => meta.type);

describe("type catalog", () => {
  it("has a sample for every content type the picker offers", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...ALL_TYPES].sort());
  });

  it("lists every type in exactly one non-popular category", () => {
    const listed = CONTENT_CATEGORIES.filter((c) => c.id !== "popular").flatMap(
      (c) => c.types,
    );
    expect([...listed].sort()).toEqual([...ALL_TYPES].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it.each(ALL_TYPES)("%s: a valid config encodes and validates", (type) => {
    const config = SAMPLES[type];
    expect(enc(config)).not.toBe("");
    expect(validateContent(config)).toEqual({ valid: true });
  });

  it.each(
    ALL_TYPES,
  )("%s: an empty config encodes to nothing and fails validation", (type) => {
    const empty = { type } as QRContentConfig;
    expect(enc(empty)).toBe("");
    const result = validateContent(empty);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it("returns an empty payload for no config", () => {
    expect(encodeQRContent(null)).toBe("");
  });

  it("rejects payloads that can't fit in a QR code with a clear error", () => {
    const result = validateContent({
      type: "text",
      text: "x".repeat(MAX_QR_PAYLOAD_BYTES + 1),
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/too long for a QR code/);
    // Multi-byte characters count as their UTF-8 bytes.
    expect(
      validateContent({ type: "text", text: "€".repeat(1000) }).valid,
    ).toBe(false);
    expect(
      validateContent({ type: "text", text: "x".repeat(MAX_QR_PAYLOAD_BYTES) })
        .valid,
    ).toBe(true);
  });
});

describe("url", () => {
  it.each([
    ["https://qrdx.dev", "https://qrdx.dev"],
    ["  https://qrdx.dev/a?b=1#c  ", "https://qrdx.dev/a?b=1#c"],
    ["qrdx.dev", "https://qrdx.dev"],
    [
      "qrdx.dev/pricing?plan=pro&x=1#faq",
      "https://qrdx.dev/pricing?plan=pro&x=1#faq",
    ],
    ["www.example.com:8080/path", "https://www.example.com:8080/path"],
    ["localhost:3000/dashboard", "https://localhost:3000/dashboard"],
    ["http://example.com", "http://example.com"],
    ["HTTPS://QRDX.DEV/A", "HTTPS://QRDX.DEV/A"],
    ["mailto:hello@qrdx.dev", "mailto:hello@qrdx.dev"],
    ["https://bücher.de/über?q=ä", "https://xn--bcher-kva.de/über?q=ä"],
    ["例え.jp", "https://xn--r8jz45g.jp"],
  ])("%j → %j", (input, expected) => {
    expect(enc({ type: "url", url: input })).toBe(expected);
  });

  it("encodes an empty or blank URL as nothing", () => {
    expect(enc({ type: "url", url: "   " })).toBe("");
    expect(normalizeWebUrl("")).toBe("");
  });
});

describe("text", () => {
  it("keeps text exactly, including newlines, unicode and emoji", () => {
    const text = 'Line 1\nLine 2 ; , : \\ " 東京 😀';
    expect(enc({ type: "text", text })).toBe(text);
  });
});

describe("email (mailto:, RFC 6068)", () => {
  it("encodes a bare address", () => {
    expect(encodeEmail({ type: "email", recipient: " hello@qrdx.dev " })).toBe(
      "mailto:hello@qrdx.dev",
    );
  });

  it("percent-encodes subject and body (spaces as %20, never +)", () => {
    expect(
      encodeEmail({
        type: "email",
        recipient: "a@b.co",
        subject: "Q&A? #1 50% off = deal",
        body: "Tom & Jerry + friends",
      }),
    ).toBe(
      "mailto:a@b.co?subject=Q%26A%3F%20%231%2050%25%20off%20%3D%20deal&body=Tom%20%26%20Jerry%20%2B%20friends",
    );
  });

  it("encodes body line breaks as %0D%0A (RFC 6068 §5)", () => {
    expect(
      encodeEmail({
        type: "email",
        recipient: "a@b.co",
        body: "one\ntwo\r\nthree",
      }),
    ).toBe("mailto:a@b.co?body=one%0D%0Atwo%0D%0Athree");
  });

  it("encodes unicode and emoji as UTF-8 percent-escapes", () => {
    expect(
      encodeEmail({ type: "email", recipient: "a@b.co", subject: "Café 👋" }),
    ).toBe("mailto:a@b.co?subject=Caf%C3%A9%20%F0%9F%91%8B");
  });

  it("keeps + and @ readable and escapes ? and % in the address", () => {
    expect(
      encodeEmail({ type: "email", recipient: "user+tag@example.com" }),
    ).toBe("mailto:user+tag@example.com");
    expect(encodeEmail({ type: "email", recipient: "odd?%@example.com" })).toBe(
      "mailto:odd%3F%25@example.com",
    );
  });

  it("supports several comma-separated recipients", () => {
    expect(encodeEmail({ type: "email", recipient: "a@x.co, b@y.co" })).toBe(
      "mailto:a@x.co,b@y.co",
    );
    expect(
      validateContent({ type: "email", recipient: "a@x.co, b@y.co" }).valid,
    ).toBe(true);
  });

  it("omits empty optional fields", () => {
    expect(
      encodeEmail({
        type: "email",
        recipient: "a@b.co",
        subject: "",
        body: "",
      }),
    ).toBe("mailto:a@b.co");
  });

  it("rejects an invalid address", () => {
    expect(
      validateContent({ type: "email", recipient: "not-an-email" }),
    ).toEqual({
      valid: false,
      error: "Invalid email format",
    });
  });
});

describe("phone (tel:, RFC 3966 / E.164)", () => {
  it.each([
    ["+1 (415) 555-0132", "tel:+14155550132"],
    ["415.555.0132", "tel:4155550132"],
    ["00 44 20 7946 0958", "tel:+442079460958"],
    ["+49 30 1234-5678", "tel:+493012345678"],
    ["+1 415 555 0132 ext. 7", "tel:+14155550132;ext=7"],
    ["+1 415 555 0132 x89", "tel:+14155550132;ext=89"],
    ["+1+2+3", "tel:+123"],
  ])("%j → %j", (input, expected) => {
    expect(encodePhone({ type: "phone", phoneNumber: input })).toBe(expected);
  });

  it("encodes input without digits as nothing", () => {
    expect(encodePhone({ type: "phone", phoneNumber: "call me" })).toBe("");
    expect(normalizePhone("---")).toEqual({ number: "" });
  });

  it.each([
    ["12", false],
    ["123", true],
    ["+123456789012345", true],
    ["+1234567890123456", false],
  ])("validates %s → %s (E.164 max 15 digits)", (phoneNumber, valid) => {
    expect(validateContent({ type: "phone", phoneNumber }).valid).toBe(valid);
  });
});

describe("sms", () => {
  it("uses SMSTO:number:message when there is a message", () => {
    expect(
      encodeSms({
        type: "sms",
        phoneNumber: "+1 (415) 555-0132",
        message: "Hi: see you at 5;",
      }),
    ).toBe("SMSTO:+14155550132:Hi: see you at 5;");
  });

  it("uses sms:number (RFC 5724) without a message", () => {
    expect(encodeSms({ type: "sms", phoneNumber: "0044 20 7946 0958" })).toBe(
      "sms:+442079460958",
    );
  });

  it("keeps unicode, emoji and newlines in the message", () => {
    expect(
      encodeSms({ type: "sms", phoneNumber: "123", message: "Hé 😀\nbye" }),
    ).toBe("SMSTO:123:Hé 😀\nbye");
  });
});

describe("whatsapp (wa.me)", () => {
  it("uses the full international number without +, 00, spaces or dashes", () => {
    expect(
      encodeWhatsApp({ type: "whatsapp", phoneNumber: "+91 98765-43210" }),
    ).toBe("https://wa.me/919876543210");
    expect(
      encodeWhatsApp({ type: "whatsapp", phoneNumber: "0044 7911 123456" }),
    ).toBe("https://wa.me/447911123456");
  });

  it("percent-encodes the prefilled text", () => {
    expect(
      encodeWhatsApp({
        type: "whatsapp",
        phoneNumber: "14155550132",
        message: "Hi & bye?\n😀",
      }),
    ).toBe("https://wa.me/14155550132?text=Hi%20%26%20bye%3F%0A%F0%9F%98%80");
  });
});

describe("wifi (ZXing WIFI: format)", () => {
  const wifi = (overrides: Partial<Parameters<typeof encodeWifi>[0]>) =>
    encodeWifi({
      type: "wifi",
      ssid: "Home",
      password: "pa55word",
      encryption: "WPA",
      ...overrides,
    });

  it("encodes a WPA network", () => {
    const payload = wifi({});
    expect(payload.startsWith("WIFI:")).toBe(true);
    expect(payload.endsWith(";;")).toBe(true);
    expect(payload).toContain("T:WPA;");
    expect(payload).toContain("S:Home;");
    expect(payload).toContain("P:pa55word;");
    expect(payload).not.toContain("H:true");
  });

  it("encodes a WEP network", () => {
    expect(wifi({ encryption: "WEP", password: "abcde" })).toContain("T:WEP;");
  });

  it("encodes an open network without a password", () => {
    const payload = wifi({ encryption: "nopass", password: "ignored" });
    expect(payload).toContain("T:nopass;");
    expect(payload).not.toContain("P:");
    expect(payload.endsWith(";;")).toBe(true);
  });

  it.each([
    "WPA",
    "WEP",
    "nopass",
  ] as const)("marks a hidden %s network with H:true", (encryption) => {
    expect(wifi({ encryption, hidden: true })).toContain("H:true;");
  });

  it('escapes \\ ; , : and " in the SSID and password', () => {
    const payload = wifi({ ssid: 'My;Net,"1":\\', password: 'p;a,s"s:\\' });
    expect(payload).toContain('S:My\\;Net\\,\\"1\\"\\:\\\\;');
    expect(payload).toContain('P:p\\;a\\,s\\"s\\:\\\\;');
  });

  it("keeps unicode SSIDs and passwords as UTF-8", () => {
    expect(wifi({ ssid: "Café ☕", password: "pässwörd😀" })).toContain(
      "S:Café ☕;P:pässwörd😀;",
    );
  });

  it("validates WPA passphrase length (IEEE 802.11i: 8-63 chars or 64 hex)", () => {
    expect(
      validateContent({
        type: "wifi",
        ssid: "a",
        password: "short",
        encryption: "WPA",
      }).valid,
    ).toBe(false);
    expect(
      validateContent({
        type: "wifi",
        ssid: "a",
        password: "x".repeat(64),
        encryption: "WPA",
      }).valid,
    ).toBe(false);
    expect(
      validateContent({
        type: "wifi",
        ssid: "a",
        password: "a".repeat(64),
        encryption: "WPA",
      }).valid,
    ).toBe(true);
    expect(
      validateContent({
        type: "wifi",
        ssid: "a",
        password: "",
        encryption: "nopass",
      }).valid,
    ).toBe(true);
  });

  it("rejects SSIDs longer than 32 bytes", () => {
    expect(
      validateContent({
        type: "wifi",
        ssid: "é".repeat(17),
        password: "",
        encryption: "nopass",
      }).valid,
    ).toBe(false);
  });
});

describe("vcard (vCard 3.0)", () => {
  const card = (overrides: Partial<Parameters<typeof encodeVCard>[0]> = {}) =>
    encodeVCard({
      type: "vcard",
      firstName: "Ada",
      lastName: "Lovelace",
      ...overrides,
    });

  it("has BEGIN/VERSION first, END last and CRLF line endings only", () => {
    const payload = card();
    expect(payload.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(payload.endsWith("END:VCARD\r\n")).toBe(true);
    expect(payload.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("includes the required N and FN properties", () => {
    const lines = card().split("\r\n");
    expect(lines).toContain("N:Lovelace;Ada;;;");
    expect(lines).toContain("FN:Ada Lovelace");
  });

  it("works with only a first name", () => {
    const lines = encodeVCard({ type: "vcard", firstName: "Cher" }).split(
      "\r\n",
    );
    expect(lines).toContain("N:;Cher;;;");
    expect(lines).toContain("FN:Cher");
  });

  it("escapes backslash, comma, semicolon and newlines in TEXT values", () => {
    const lines = card({
      lastName: "O'Brien; Jr",
      organization: "Acme, Inc\\Labs",
      note: "Line one\nLine two",
      address: "1 Main St, Apt 2; Springfield",
    }).split("\r\n");
    expect(lines).toContain("N:O'Brien\\; Jr;Ada;;;");
    expect(lines).toContain("FN:Ada O'Brien\\; Jr");
    expect(lines).toContain("ORG:Acme\\, Inc\\\\Labs");
    expect(lines).toContain("NOTE:Line one\\nLine two");
    expect(lines).toContain("ADR:;;1 Main St\\, Apt 2\\; Springfield;;;;");
  });

  it("can't be broken into extra properties by a newline in a value", () => {
    const payload = card({ note: "hi\nEND:VCARD\nBEGIN:VCARD\nFN:Mallory" });
    expect(payload.match(/^BEGIN:VCARD$/gm)).toHaveLength(1);
    expect(payload.match(/^FN:/gm)).toHaveLength(1);
  });

  it("keeps URLs as URIs (commas are not escaped)", () => {
    expect(card({ url: "https://example.com/a,b" }).split("\r\n")).toContain(
      "URL:https://example.com/a,b",
    );
  });

  it("folds lines over 75 octets without splitting UTF-8 characters", () => {
    const payload = card({ note: "Zoë 😀 ".repeat(30) });
    const physical = payload.split("\r\n");
    for (const line of physical) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // Unfolding (RFC 6350 §3.2) restores the logical line.
    const unfolded = payload.replace(/\r\n /g, "");
    expect(unfolded).toContain(`NOTE:${"Zoë 😀 ".repeat(30).trim()}`);
    expect(unfolded).not.toContain("\uFFFD");
  });

  it("omits empty optional fields", () => {
    const payload = card({
      organization: "",
      phone: " ",
      email: "",
      url: "",
      address: "",
      note: "",
    });
    expect(payload).not.toMatch(/^(ORG|TEL|EMAIL|URL|ADR|NOTE)/m);
  });
});

describe("maps", () => {
  it.each([
    ["40.7128, -74.0060", "https://www.google.com/maps?q=40.7128,-74.0060"],
    ["48.8584,2.2945", "https://www.google.com/maps?q=48.8584,2.2945"],
    ["+48.8584, +2.2945", "https://www.google.com/maps?q=48.8584,2.2945"],
    ["-90, 180", "https://www.google.com/maps?q=-90,180"],
  ])("treats %j as coordinates", (location, expected) => {
    expect(enc({ type: "maps", location })).toBe(expected);
  });

  it.each([
    "91, 10",
    "45, 181",
  ])("treats out-of-range %j as a search, not coordinates (RFC 5870 ranges)", (location) => {
    expect(enc({ type: "maps", location })).toBe(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`,
    );
  });

  it("percent-encodes a trimmed address search", () => {
    expect(
      enc({ type: "maps", location: "  Champ de Mars, 75007 Paris & co  " }),
    ).toBe(
      "https://www.google.com/maps/search/?api=1&query=Champ%20de%20Mars%2C%2075007%20Paris%20%26%20co",
    );
  });
});

describe("social profiles", () => {
  it.each<[QRContentConfig, string]>([
    [
      { type: "instagram", username: "@qrdx " },
      "https://www.instagram.com/qrdx",
    ],
    [
      { type: "instagram", username: "https://instagram.com/qrdx/?igsh=abc" },
      "https://www.instagram.com/qrdx",
    ],
    [{ type: "tiktok", username: "@qrdx" }, "https://www.tiktok.com/@qrdx"],
    [
      { type: "tiktok", username: "https://www.tiktok.com/@qrdx?lang=en" },
      "https://www.tiktok.com/@qrdx",
    ],
    [{ type: "twitter", username: "@qrdx" }, "https://twitter.com/qrdx"],
    [
      { type: "twitter", username: "https://x.com/qrdx" },
      "https://twitter.com/qrdx",
    ],
    [
      { type: "pinterest", username: "qrdx/" },
      "https://www.pinterest.com/qrdx",
    ],
    [
      { type: "snapchat", username: "https://www.snapchat.com/add/qrdx" },
      "https://www.snapchat.com/add/qrdx",
    ],
    [{ type: "threads", username: "@qrdx" }, "https://www.threads.net/@qrdx"],
    [
      { type: "threads", username: "https://www.threads.com/@qrdx" },
      "https://www.threads.net/@qrdx",
    ],
    [
      { type: "reddit", subreddit: "r/qrcodes" },
      "https://www.reddit.com/r/qrcodes",
    ],
    [
      { type: "reddit", subreddit: "/r/qrcodes/" },
      "https://www.reddit.com/r/qrcodes",
    ],
    [
      { type: "reddit", subreddit: "https://www.reddit.com/r/qrcodes/" },
      "https://www.reddit.com/r/qrcodes",
    ],
    [
      { type: "reddit", username: "u/spez" },
      "https://www.reddit.com/user/spez",
    ],
    [
      { type: "reddit", username: "https://reddit.com/user/spez" },
      "https://www.reddit.com/user/spez",
    ],
    [
      { type: "facebook", profileUrl: "facebook.com/qrdx" },
      "https://facebook.com/qrdx",
    ],
    [{ type: "facebook", profileUrl: "qrdx" }, "https://www.facebook.com/qrdx"],
    [
      { type: "linkedin", profileUrl: "ada-lovelace" },
      "https://www.linkedin.com/in/ada-lovelace",
    ],
    [
      {
        type: "linkedin",
        profileUrl: " https://www.linkedin.com/company/qrdx ",
      },
      "https://www.linkedin.com/company/qrdx",
    ],
    [
      { type: "youtube", videoUrl: "youtu.be/dQw4w9WgXcQ?t=42" },
      "https://youtu.be/dQw4w9WgXcQ?t=42",
    ],
    [{ type: "youtube", channelUrl: "@qrdx" }, "https://www.youtube.com/@qrdx"],
    [
      {
        type: "youtube",
        channelUrl: "https://youtube.com/@a",
        videoUrl: "https://youtu.be/b",
      },
      "https://youtu.be/b",
    ],
  ])("%j → %s", (config, expected) => {
    expect(enc(config)).toBe(expected);
  });

  it("rejects usernames with spaces or symbols", () => {
    const result = validateContent({
      type: "instagram",
      username: "john doe!",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/letters, numbers/);
  });
});

describe("payments", () => {
  it("UPI: pa with a literal @, pn, am, cu=INR and tn in spec order", () => {
    expect(enc(SAMPLES.upi)).toBe(
      "upi://pay?pa=shop@okaxis&pn=Chai%20Shop&am=49.50&cu=INR&tn=Order%2012",
    );
  });

  it("UPI: always sends the currency, even without an amount", () => {
    expect(enc({ type: "upi", upiId: " shop@okaxis " })).toBe(
      "upi://pay?pa=shop@okaxis&cu=INR",
    );
  });

  it.each([
    ["100", true],
    ["49.5", true],
    ["49.50", true],
    ["49.505", false],
    ["-1", false],
    ["1,000", false],
    ["0", false],
    ["abc", false],
  ])("UPI: amount %j valid=%s", (amount, valid) => {
    expect(validateContent({ type: "upi", upiId: "a@b", amount }).valid).toBe(
      valid,
    );
  });

  it("Bitcoin: BIP-21 with decimal BTC amount and percent-encoded label/message", () => {
    expect(
      enc({
        type: "bitcoin",
        address: " bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq ",
        amount: " 0.00100000 ",
        label: "Luke Jr",
        message: "Donation for project xyz & more",
      }),
    ).toBe(
      "bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.00100000&label=Luke%20Jr&message=Donation%20for%20project%20xyz%20%26%20more",
    );
  });

  it.each([
    ["0.00000001", true],
    ["0.000000001", false],
    ["1,5", false],
  ])("Bitcoin: amount %j valid=%s (8 decimals max)", (amount, valid) => {
    expect(
      validateContent({
        type: "bitcoin",
        address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
        amount,
      }).valid,
    ).toBe(valid);
  });

  it("Ethereum: EIP-681 value in wei (decimal ETH × 1e18)", () => {
    expect(enc(SAMPLES.ethereum)).toBe(
      "ethereum:0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7?value=0.5e18",
    );
    expect(
      enc({
        type: "ethereum",
        address: "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7",
        amount: "2.014e18",
        gas: "21000",
      }),
    ).toBe(
      "ethereum:0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7?value=2.014e18&gas=21000",
    );
  });

  it("Ethereum: rejects amounts finer than one wei and malformed addresses", () => {
    const address = "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7";
    expect(
      validateContent({
        type: "ethereum",
        address,
        amount: `0.${"0".repeat(18)}1`,
      }).valid,
    ).toBe(false);
    expect(validateContent({ type: "ethereum", address: "0x123" }).valid).toBe(
      false,
    );
  });

  it("PayPal: a PayPal.Me username becomes a paypal.me link", () => {
    expect(enc({ type: "paypal", paypalUrl: "qrdx" })).toBe(
      "https://paypal.me/qrdx",
    );
    expect(enc({ type: "paypal", paypalUrl: "paypal.me/qrdx/10" })).toBe(
      "https://paypal.me/qrdx/10",
    );
  });

  it("Venmo: pay link with amount and percent-encoded note", () => {
    expect(enc(SAMPLES.venmo)).toBe(
      "https://venmo.com/qrdx?txn=pay&amount=5&note=Coffee",
    );
    expect(enc({ type: "venmo", username: "@qrdx", note: "Pizza & 🍕" })).toBe(
      "https://venmo.com/qrdx?txn=pay&note=Pizza%20%26%20%F0%9F%8D%95",
    );
  });
});

describe("links", () => {
  it.each<[QRContentConfig, string]>([
    [
      { type: "google-review", placeId: " ChIJN1t_tDeuEmsRUsoyG83frY4 " },
      "https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4",
    ],
    [
      {
        type: "google-review",
        placeId: "https://search.google.com/local/writereview?placeid=ChIJabc",
      },
      "https://search.google.com/local/writereview?placeid=ChIJabc",
    ],
    [
      { type: "spotify", uri: "spotify:album:1DFixLWuPkv3KT3TnV35m3" },
      "spotify:album:1DFixLWuPkv3KT3TnV35m3",
    ],
    [
      { type: "spotify", uri: " open.spotify.com/track/abc?si=1 " },
      "https://open.spotify.com/track/abc?si=1",
    ],
    [{ type: "etsy", shopUrl: "MyShop" }, "https://www.etsy.com/shop/MyShop"],
    [{ type: "calcom", bookingUrl: "qrdx" }, "https://cal.com/qrdx"],
    [
      { type: "calcom", bookingUrl: "cal.com/qrdx/15min" },
      "https://cal.com/qrdx/15min",
    ],
    [
      { type: "amazon", productUrl: "amazon.in/dp/B0C?th=1" },
      "https://amazon.in/dp/B0C?th=1",
    ],
    [
      { type: "flipkart", productUrl: " https://www.flipkart.com/x/p/itm1 " },
      "https://www.flipkart.com/x/p/itm1",
    ],
    [{ type: "attendance", formUrl: "forms.gle/abc" }, "https://forms.gle/abc"],
    [{ type: "dubsh", shortUrl: "dub.sh/qrdx" }, "https://dub.sh/qrdx"],
    [
      { type: "google-drive", url: "drive.google.com/drive/folders/1" },
      "https://drive.google.com/drive/folders/1",
    ],
  ])("%j → %s", (config, expected) => {
    expect(enc(config)).toBe(expected);
  });
});
