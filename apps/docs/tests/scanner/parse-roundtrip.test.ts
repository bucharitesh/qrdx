// The scanner's parser must invert the encoder: whatever a user types into a
// form comes back from parseScan(encode(form)) unchanged. Inputs come from a
// seeded generator full of separators, escapes, unicode and emoji, so every
// run checks the same few thousand cases.
import { describe, expect, it } from "vitest";
import { type ParsedScan, parseScan } from "@/components/scanner/parse";
import {
  encodeBitcoin,
  encodeEmail,
  encodeEthereum,
  encodePhone,
  encodeQRContent,
  encodeSms,
  encodeUPI,
  encodeVCard,
  encodeWifi,
  normalizePhone,
} from "@/utils/qr-content-encoder";
import { createRandom, HOSTILE } from "../support/prng";
import { SAMPLES } from "../support/samples";

const RUNS = 150;
const DIGITS = "0123456789".split("");

function kind<K extends ParsedScan["kind"]>(parsed: ParsedScan, expected: K) {
  expect(parsed.kind).toBe(expected);
  return parsed as Extract<ParsedScan, { kind: K }>;
}

/** Random text that is never blank and has no leading/trailing whitespace. */
function text(
  random: ReturnType<typeof createRandom>,
  min: number,
  max: number,
) {
  return `x${random.string(HOSTILE, min, max)}y`;
}

const field = (fields: { label: string; value: string }[], label: string) =>
  fields.find((f) => f.label === label)?.value;

describe("encode → parseScan round trips (seeded)", () => {
  it("Wi-Fi keeps SSID, password, security and hidden flag", () => {
    const random = createRandom(1);
    for (let i = 0; i < RUNS; i++) {
      const encryption = random.pick(["WPA", "WEP", "nopass"] as const);
      const input = {
        type: "wifi" as const,
        ssid: text(random, 0, 20),
        password: text(random, 6, 30),
        encryption,
        hidden: random.bool(),
      };
      const parsed = kind(parseScan(encodeWifi(input)), "wifi");
      expect(parsed.ssid).toBe(input.ssid);
      expect(parsed.password).toBe(
        encryption === "nopass" ? "" : input.password,
      );
      expect(parsed.security).toBe(
        encryption === "nopass" ? "None" : encryption,
      );
      expect(parsed.hidden).toBe(input.hidden);
    }
  });

  it("vCard keeps every contact field, including , ; \\ and newlines", () => {
    const random = createRandom(2);
    for (let i = 0; i < RUNS; i++) {
      const input = {
        type: "vcard" as const,
        firstName: text(random, 0, 12),
        lastName: text(random, 0, 12),
        organization: text(random, 0, 20),
        phone: `+${random.string(DIGITS, 7, 12)}`,
        email: `${random.string(DIGITS, 1, 5)}@example.com`,
        url: `https://example.com/${random.string(DIGITS, 1, 5)}`,
        address: text(random, 0, 40),
        note: text(random, 0, 120),
      };
      const parsed = kind(parseScan(encodeVCard(input)), "contact");
      expect(parsed.contact.name).toBe(`${input.firstName} ${input.lastName}`);
      expect(parsed.contact.organization).toBe(input.organization);
      expect(parsed.contact.phones).toEqual([input.phone]);
      expect(parsed.contact.emails).toEqual([input.email]);
      expect(parsed.contact.urls).toEqual([input.url]);
      expect(parsed.contact.address).toBe(input.address);
      expect(parsed.contact.note).toBe(input.note);
    }
  });

  it("mailto keeps recipient, subject and body", () => {
    const random = createRandom(3);
    for (let i = 0; i < RUNS; i++) {
      const input = {
        type: "email" as const,
        recipient: `user+${random.string(DIGITS, 1, 4)}@example.com`,
        subject: text(random, 0, 30),
        body: text(random, 0, 80),
      };
      const parsed = kind(parseScan(encodeEmail(input)), "email");
      expect(parsed.to).toBe(input.recipient);
      expect(parsed.subject).toBe(input.subject);
      // RFC 6068 bodies carry CRLF line breaks.
      expect(parsed.body.replace(/\r\n/g, "\n")).toBe(
        input.body.replace(/\r\n|\r/g, "\n"),
      );
    }
  });

  it("SMS keeps the number and message", () => {
    const random = createRandom(4);
    for (let i = 0; i < RUNS; i++) {
      const input = {
        type: "sms" as const,
        phoneNumber: `+1 (${random.string(DIGITS, 3, 3)}) ${random.string(DIGITS, 3, 3)}-${random.string(DIGITS, 4, 4)}`,
        message: random.bool() ? text(random, 0, 60) : "",
      };
      const parsed = kind(parseScan(encodeSms(input)), "sms");
      expect(parsed.number).toBe(normalizePhone(input.phoneNumber).number);
      expect(parsed.body).toBe(input.message);
    }
  });

  it("tel: keeps the dialable number", () => {
    const random = createRandom(5);
    for (let i = 0; i < RUNS; i++) {
      const phoneNumber = `00${random.string(DIGITS, 8, 12)}`;
      const parsed = kind(
        parseScan(encodePhone({ type: "phone", phoneNumber })),
        "phone",
      );
      expect(parsed.number).toBe(`+${phoneNumber.slice(2)}`);
    }
  });

  it("UPI keeps payee, VPA, amount and note", () => {
    const random = createRandom(6);
    for (let i = 0; i < RUNS; i++) {
      const input = {
        type: "upi" as const,
        upiId: `${random.string(DIGITS, 3, 8)}@okaxis`,
        name: text(random, 0, 20),
        amount: `${random.int(1, 9999)}.${random.string(DIGITS, 2, 2)}`,
        note: text(random, 0, 30),
      };
      const parsed = kind(parseScan(encodeUPI(input)), "payment");
      expect(parsed.scheme).toBe("upi");
      expect(parsed.payee).toBe(input.name);
      expect(parsed.copyValue).toBe(input.upiId);
      expect(parsed.amount).toBe(`INR ${input.amount}`);
      expect(field(parsed.fields, "Note")).toBe(input.note);
    }
  });

  it("Bitcoin keeps address, amount, label and message", () => {
    const random = createRandom(7);
    for (let i = 0; i < RUNS; i++) {
      const input = {
        type: "bitcoin" as const,
        address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
        amount: `0.${random.string(DIGITS, 1, 8)}`,
        label: text(random, 0, 20),
        message: text(random, 0, 40),
      };
      const parsed = kind(parseScan(encodeBitcoin(input)), "payment");
      expect(parsed.copyValue).toBe(input.address);
      expect(parsed.amount).toBe(`${input.amount} BTC`);
      expect(field(parsed.fields, "Label")).toBe(input.label);
      expect(field(parsed.fields, "Message")).toBe(input.message);
    }
  });

  it("Ethereum reads the EIP-681 wei value back as the ETH amount typed", () => {
    for (const amount of ["1", "0.5", "0.000000000000000001", "12.3456"]) {
      const parsed = kind(
        parseScan(
          encodeEthereum({
            type: "ethereum",
            address: SAMPLES.ethereum.address,
            amount,
          }),
        ),
        "payment",
      );
      expect(parsed.amount).toBe(`${amount} ETH`);
    }
  });

  it("every link type parses as the same URL", () => {
    const linkTypes = [
      "url",
      "maps",
      "facebook",
      "instagram",
      "reddit",
      "tiktok",
      "twitter",
      "linkedin",
      "youtube",
      "pinterest",
      "snapchat",
      "threads",
      "google-review",
      "etsy",
      "dubsh",
      "attendance",
      "amazon",
      "flipkart",
      "calcom",
      "google-drive",
      "whatsapp",
    ] as const;
    for (const type of linkTypes) {
      const payload = encodeQRContent(SAMPLES[type]);
      const parsed = kind(parseScan(payload), "url");
      expect(parsed.url, type).toBe(new URL(payload).toString());
    }
  });

  it("PayPal and Venmo links parse as payments", () => {
    expect(
      kind(parseScan(encodeQRContent(SAMPLES.paypal)), "payment").scheme,
    ).toBe("paypal");
    const venmo = kind(parseScan(encodeQRContent(SAMPLES.venmo)), "payment");
    expect(venmo.scheme).toBe("venmo");
    expect(venmo.amount).toBe("5");
  });

  it("plain text that looks like nothing else stays text", () => {
    const random = createRandom(8);
    for (let i = 0; i < RUNS; i++) {
      const value = `note ${text(random, 0, 50)}`;
      expect(parseScan(encodeQRContent({ type: "text", text: value }))).toEqual(
        {
          kind: "text",
          text: value,
        },
      );
    }
  });
});
