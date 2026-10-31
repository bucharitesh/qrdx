import { z } from "zod";

// QR payload builders for structured content. Each follows the format that
// scanner apps (iOS Camera, Google Lens, ZXing) recognize:
// - Wi-Fi: "WIFI:" URI (Wi-Fi Alliance WPA3 spec §7 / ZXing)
// - vCard 3.0: RFC 2426
// - Email: mailto: URI, RFC 6068
// - SMS: sms: URI, RFC 5724 (or the common SMSTO: form)
// - Location: geo: URI, RFC 5870

const utf8Length = (value: string) => new TextEncoder().encode(value).length;

const phoneNumber = z
  .string()
  .transform((value) => value.replace(/[\s().-]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^\+?\d{3,15}$/,
        "Must be a phone number with 3-15 digits, optionally starting with + (international format recommended)",
      ),
  );

// ── Wi-Fi ───────────────────────────────────────────────────────────────────

export const wifiPayloadSchema = z
  .object({
    ssid: z
      .string()
      .min(1)
      .refine((value) => utf8Length(value) <= 32, "Must be at most 32 bytes")
      .describe("Network name (SSID)"),
    password: z
      .string()
      .max(64)
      .optional()
      .describe("Network password. Leave out for open networks."),
    security: z
      .enum(["WPA", "WEP", "nopass"])
      .default("WPA")
      .describe(
        "WPA covers WPA, WPA2 and WPA3 personal networks; nopass is an open network",
      ),
    hidden: z
      .boolean()
      .default(false)
      .describe("True when the network does not broadcast its SSID"),
  })
  .superRefine((value, ctx) => {
    const length = value.password?.length ?? 0;
    if (value.security === "WPA" && (length < 8 || length > 63)) {
      if (!(length === 64 && /^[0-9a-f]+$/i.test(value.password ?? ""))) {
        ctx.addIssue({
          code: "custom",
          path: ["password"],
          message:
            "WPA passwords are 8-63 characters (or 64 hex digits). Use security nopass for open networks.",
        });
      }
    }
    if (value.security === "WEP" && length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "A WEP network needs a password",
      });
    }
  });

const escapeWifi = (value: string) => value.replace(/([\\;,":])/g, "\\$1");

export function buildWifiPayload(
  input: z.output<typeof wifiPayloadSchema>,
): string {
  const fields = [`T:${input.security}`, `S:${escapeWifi(input.ssid)}`];
  if (input.hidden) fields.push("H:true");
  if (input.security !== "nopass" && input.password) {
    fields.push(`P:${escapeWifi(input.password)}`);
  }
  return `WIFI:${fields.join(";")};;`;
}

// ── vCard 3.0 ───────────────────────────────────────────────────────────────

const optionalText = (max: number, description: string) =>
  z.string().trim().min(1).max(max).optional().describe(description);

export const vcardPayloadSchema = z
  .object({
    firstName: optionalText(100, "Given name"),
    lastName: optionalText(100, "Family name"),
    organization: optionalText(200, "Company or organization"),
    title: optionalText(200, "Job title"),
    phone: phoneNumber.optional().describe("Mobile phone number"),
    workPhone: phoneNumber.optional().describe("Work phone number"),
    email: z.email().optional().describe("Email address"),
    url: z.url().optional().describe("Website URL"),
    street: optionalText(200, "Street address"),
    city: optionalText(100, "City"),
    region: optionalText(100, "State, province or region"),
    postalCode: optionalText(20, "Postal code"),
    country: optionalText(100, "Country"),
    note: optionalText(500, "Free-form note"),
  })
  .refine(
    (value) => value.firstName || value.lastName || value.organization,
    "Provide at least firstName, lastName or organization",
  );

/** RFC 2426 §4 text escaping: backslash, comma, semicolon and newlines. */
const escapeVcard = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r\n|\r|\n/g, "\\n");

const singleLine = (value: string) => value.replace(/[\r\n]+/g, " ");

/** RFC 6350 §3.2: folds at 75 octets without splitting UTF-8 characters. */
function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = utf8Length(char);
    // Continuation lines start with a space, so they hold 74 octets of content.
    if (bytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildVcardPayload(
  input: z.output<typeof vcardPayloadSchema>,
): string {
  const fullName =
    [input.firstName, input.lastName].filter(Boolean).join(" ") ||
    input.organization ||
    "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVcard(input.lastName ?? "")};${escapeVcard(input.firstName ?? "")};;;`,
    `FN:${escapeVcard(fullName)}`,
  ];
  if (input.organization) lines.push(`ORG:${escapeVcard(input.organization)}`);
  if (input.title) lines.push(`TITLE:${escapeVcard(input.title)}`);
  if (input.phone) lines.push(`TEL;TYPE=CELL:${input.phone}`);
  if (input.workPhone) lines.push(`TEL;TYPE=WORK,VOICE:${input.workPhone}`);
  if (input.email) lines.push(`EMAIL;TYPE=INTERNET:${input.email}`);
  if (input.url) lines.push(`URL:${singleLine(input.url)}`);
  if (
    input.street ||
    input.city ||
    input.region ||
    input.postalCode ||
    input.country
  ) {
    const parts = [
      "",
      "",
      input.street,
      input.city,
      input.region,
      input.postalCode,
      input.country,
    ].map((part) => escapeVcard(part ?? ""));
    lines.push(`ADR:${parts.join(";")}`);
  }
  if (input.note) lines.push(`NOTE:${escapeVcard(input.note)}`);
  lines.push("END:VCARD");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

// ── Email (mailto:) ────────────────────────────────────────────────────────

export const emailPayloadSchema = z.object({
  to: z.email().describe("Recipient address"),
  cc: z.array(z.email()).max(10).optional().describe("Cc addresses"),
  bcc: z.array(z.email()).max(10).optional().describe("Bcc addresses"),
  subject: z.string().max(255).optional().describe("Subject line"),
  body: z.string().max(1500).optional().describe("Message body"),
});

const encodeAddress = (address: string) =>
  encodeURIComponent(address).replace(/%40/g, "@");

export function buildEmailPayload(
  input: z.output<typeof emailPayloadSchema>,
): string {
  const query: string[] = [];
  if (input.cc?.length) {
    query.push(`cc=${input.cc.map(encodeAddress).join(",")}`);
  }
  if (input.bcc?.length) {
    query.push(`bcc=${input.bcc.map(encodeAddress).join(",")}`);
  }
  if (input.subject) {
    query.push(`subject=${encodeURIComponent(input.subject)}`);
  }
  if (input.body) {
    // RFC 6068 §5: line breaks in the body are encoded as %0D%0A.
    const body = input.body.replace(/\r\n|\r|\n/g, "\r\n");
    query.push(`body=${encodeURIComponent(body)}`);
  }
  const suffix = query.length > 0 ? `?${query.join("&")}` : "";
  return `mailto:${encodeAddress(input.to)}${suffix}`;
}

// ── SMS ────────────────────────────────────────────────────────────────────

export const smsPayloadSchema = z.object({
  phone: phoneNumber.describe(
    "Recipient phone number, international format recommended (e.g. +14155550123)",
  ),
  message: z.string().max(1000).optional().describe("Prefilled message text"),
  format: z
    .enum(["sms", "smsto"])
    .default("sms")
    .describe(
      "sms: RFC 5724 URI (sms:+1...?body=...). smsto: the older SMSTO:number:message form some scanners expect.",
    ),
});

export function buildSmsPayload(
  input: z.output<typeof smsPayloadSchema>,
): string {
  if (input.format === "smsto") {
    return `SMSTO:${input.phone}:${input.message ?? ""}`;
  }
  return input.message
    ? `sms:${input.phone}?body=${encodeURIComponent(input.message)}`
    : `sms:${input.phone}`;
}

// ── Location (geo:) ────────────────────────────────────────────────────────

export const geoPayloadSchema = z.object({
  latitude: z.number().min(-90).max(90).describe("Latitude in decimal degrees"),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .describe("Longitude in decimal degrees"),
  altitude: z.number().optional().describe("Altitude in meters"),
  uncertainty: z
    .number()
    .min(0)
    .optional()
    .describe("Location uncertainty in meters"),
});

/** Fixed-point number without exponent or trailing zeros. */
function formatNumber(value: number): string {
  const text = value.toFixed(7).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
}

export function buildGeoPayload(
  input: z.output<typeof geoPayloadSchema>,
): string {
  const coordinates = [input.latitude, input.longitude];
  if (input.altitude !== undefined) coordinates.push(input.altitude);
  const uncertainty =
    input.uncertainty === undefined
      ? ""
      : `;u=${formatNumber(input.uncertainty)}`;
  return `geo:${coordinates.map(formatNumber).join(",")}${uncertainty}`;
}
