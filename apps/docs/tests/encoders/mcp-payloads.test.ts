// The MCP server's structured payload builders against their specs: ZXing
// WIFI:, vCard 3.0 (RFC 2426), mailto: (RFC 6068), sms: (RFC 5724) and geo:
// (RFC 5870).
import { describe, expect, it } from "vitest";
import {
  buildEmailPayload,
  buildGeoPayload,
  buildSmsPayload,
  buildVcardPayload,
  buildWifiPayload,
  emailPayloadSchema,
  geoPayloadSchema,
  smsPayloadSchema,
  vcardPayloadSchema,
  wifiPayloadSchema,
} from "@/app/api/mcp/payloads";

describe("Wi-Fi", () => {
  const wifi = (input: unknown) =>
    buildWifiPayload(wifiPayloadSchema.parse(input));

  it("encodes a WPA network with escaped specials", () => {
    expect(wifi({ ssid: 'A;B,C:"D"\\', password: "p;a,s:s\\word" })).toBe(
      'WIFI:T:WPA;S:A\\;B\\,C\\:\\"D\\"\\\\;P:p\\;a\\,s\\:s\\\\word;;',
    );
  });

  it("marks hidden networks and leaves the password out of open ones", () => {
    expect(wifi({ ssid: "Guest", security: "nopass", hidden: true })).toBe(
      "WIFI:T:nopass;S:Guest;H:true;;",
    );
  });

  it.each([
    [{ ssid: "x", password: "short" }, false],
    [{ ssid: "x", password: "a".repeat(63) }, true],
    [{ ssid: "x", password: "f".repeat(64) }, true],
    [{ ssid: "x", password: "z".repeat(64) }, false],
    [{ ssid: "x", security: "WEP" }, false],
    [{ ssid: "é".repeat(17), security: "nopass" }, false],
    [{ ssid: "", security: "nopass" }, false],
  ])("validates %j → %s", (input, valid) => {
    expect(wifiPayloadSchema.safeParse(input).success).toBe(valid);
  });
});

describe("vCard 3.0", () => {
  const card = (input: unknown) =>
    buildVcardPayload(vcardPayloadSchema.parse(input));

  it("writes CRLF lines with BEGIN/VERSION/N/FN and escaped TEXT", () => {
    const payload = card({
      firstName: "Zoë",
      lastName: "O'Brien; Jr",
      organization: "Acme, Inc",
      note: "a\nb",
      city: "Paris",
    });
    expect(payload.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(payload.endsWith("END:VCARD\r\n")).toBe(true);
    const lines = payload.split("\r\n");
    expect(lines).toContain("N:O'Brien\\; Jr;Zoë;;;");
    expect(lines).toContain("FN:Zoë O'Brien\\; Jr");
    expect(lines).toContain("ORG:Acme\\, Inc");
    expect(lines).toContain("NOTE:a\\nb");
    expect(lines).toContain("ADR:;;;Paris;;;");
  });

  it("falls back to the organization for FN", () => {
    expect(card({ organization: "Acme" }).split("\r\n")).toContain("FN:Acme");
  });

  it("requires a name or organization", () => {
    expect(
      vcardPayloadSchema.safeParse({ phone: "+14155550132" }).success,
    ).toBe(false);
  });

  it("normalizes phone formatting and rejects non-numbers", () => {
    expect(card({ firstName: "A", phone: "+1 (415) 555-0132" })).toContain(
      "TEL;TYPE=CELL:+14155550132",
    );
    expect(
      vcardPayloadSchema.safeParse({ firstName: "A", phone: "call me" })
        .success,
    ).toBe(false);
  });

  it("folds content lines longer than 75 octets (RFC 6350 §3.2)", () => {
    const payload = card({ firstName: "A", note: "word ".repeat(80).trim() });
    for (const line of payload.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});

describe("mailto:", () => {
  const mail = (input: unknown) =>
    buildEmailPayload(emailPayloadSchema.parse(input));

  it("percent-encodes subject/body and uses %0D%0A for line breaks", () => {
    expect(mail({ to: "a@b.co", subject: "Hi & bye?", body: "1\n2" })).toBe(
      "mailto:a@b.co?subject=Hi%20%26%20bye%3F&body=1%0D%0A2",
    );
  });

  it("joins cc and bcc with commas", () => {
    expect(
      mail({ to: "a@b.co", cc: ["c@d.co", "e@f.co"], bcc: ["g@h.co"] }),
    ).toBe("mailto:a@b.co?cc=c@d.co,e@f.co&bcc=g@h.co");
  });

  it("rejects a malformed address", () => {
    expect(emailPayloadSchema.safeParse({ to: "nope" }).success).toBe(false);
  });
});

describe("sms:", () => {
  const sms = (input: unknown) =>
    buildSmsPayload(smsPayloadSchema.parse(input));

  it("uses RFC 5724 sms:number?body= by default", () => {
    expect(sms({ phone: "+1 415 555 0132", message: "Hi & bye" })).toBe(
      "sms:+14155550132?body=Hi%20%26%20bye",
    );
    expect(sms({ phone: "+14155550132" })).toBe("sms:+14155550132");
  });

  it("uses SMSTO:number:message on request", () => {
    expect(sms({ phone: "+14155550132", message: "Hi", format: "smsto" })).toBe(
      "SMSTO:+14155550132:Hi",
    );
  });
});

describe("geo: (RFC 5870)", () => {
  const geo = (input: unknown) =>
    buildGeoPayload(geoPayloadSchema.parse(input));

  it.each([
    [{ latitude: 48.8584, longitude: 2.2945 }, "geo:48.8584,2.2945"],
    [
      { latitude: -33.8688, longitude: 151.2093, altitude: 58 },
      "geo:-33.8688,151.2093,58",
    ],
    [{ latitude: 0, longitude: -0 }, "geo:0,0"],
    [{ latitude: 1e-8, longitude: 10 }, "geo:0,10"],
    [{ latitude: 40, longitude: -74, uncertainty: 25 }, "geo:40,-74;u=25"],
  ])("%j → %s", (input, expected) => {
    expect(geo(input)).toBe(expected);
  });

  it.each([
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: 0, longitude: 0, uncertainty: -1 },
  ])("rejects out-of-range %j", (input) => {
    expect(geoPayloadSchema.safeParse(input).success).toBe(false);
  });
});
