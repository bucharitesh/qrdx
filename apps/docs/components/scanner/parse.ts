// Turns a decoded barcode value into a typed result for the scanner's cards.
// Pure (no DOM), so it runs in tests and on the server alike.

export interface Field {
  label: string;
  value: string;
}

export interface Contact {
  name: string;
  organization?: string;
  title?: string;
  phones: string[];
  emails: string[];
  urls: string[];
  address?: string;
  note?: string;
}

export interface CalendarEvent {
  summary: string;
  start?: string;
  end?: string;
  location?: string;
  description?: string;
  allDay: boolean;
}

export type PaymentScheme =
  | "upi"
  | "bitcoin"
  | "ethereum"
  | "paypal"
  | "venmo"
  | "epc";

export interface Gs1Data {
  /** Human-readable application identifiers, in the order they appeared. */
  fields: Field[];
  gtin?: string;
}

export type ParsedScan =
  | { kind: "url"; url: string; gs1?: Gs1Data }
  | {
      kind: "wifi";
      ssid: string;
      password: string;
      security: string;
      hidden: boolean;
    }
  | {
      kind: "contact";
      format: "vcard" | "mecard";
      contact: Contact;
      vcard: string;
    }
  | { kind: "event"; event: CalendarEvent; ics: string }
  | { kind: "geo"; lat: number; lon: number; label?: string }
  | { kind: "phone"; number: string }
  | { kind: "sms"; number: string; body: string }
  | { kind: "email"; to: string; subject: string; body: string }
  | {
      kind: "payment";
      scheme: PaymentScheme;
      payee: string;
      amount?: string;
      fields: Field[];
      /** Link that opens a payment app or page (always behind a confirm step). */
      openUrl?: string;
      /** Value worth copying (address, IBAN, UPI ID). */
      copyValue: string;
    }
  | { kind: "gs1"; data: Gs1Data }
  | { kind: "product"; code: string; checkDigitValid: boolean | null }
  | { kind: "text"; text: string };

export type ScanKind = ParsedScan["kind"];

export const KIND_LABELS: Record<ScanKind, string> = {
  url: "Link",
  wifi: "Wi-Fi network",
  contact: "Contact",
  event: "Calendar event",
  geo: "Location",
  phone: "Phone number",
  sms: "Text message",
  email: "Email",
  payment: "Payment",
  gs1: "GS1 product data",
  product: "Product barcode",
  text: "Text",
};

const PRODUCT_FORMATS = new Set(["ean_13", "ean_8", "upc_a", "upc_e"]);

export function parseScan(raw: string, format?: string): ParsedScan {
  const value = raw.trim();
  const lower = value.toLowerCase();

  if (format && PRODUCT_FORMATS.has(format) && /^\d{6,14}$/.test(value)) {
    return {
      kind: "product",
      code: value,
      checkDigitValid: format === "upc_e" ? null : isValidGtin(value),
    };
  }

  if (/^https?:\/\//i.test(value)) {
    return parseWebLink(value) ?? { kind: "text", text: raw };
  }
  if (lower.startsWith("wifi:")) return parseWifi(value) ?? text(raw);
  if (lower.startsWith("begin:vcard")) return parseVcard(value) ?? text(raw);
  if (lower.startsWith("mecard:")) return parseMecard(value) ?? text(raw);
  if (lower.startsWith("begin:vevent") || lower.startsWith("begin:vcalendar")) {
    return parseEvent(value) ?? text(raw);
  }
  if (lower.startsWith("geo:")) return parseGeo(value) ?? text(raw);
  if (lower.startsWith("tel:")) {
    const number = decodeSafe(value.slice(4)).trim();
    return number ? { kind: "phone", number } : text(raw);
  }
  if (lower.startsWith("sms:") || lower.startsWith("smsto:")) {
    return parseSms(value) ?? text(raw);
  }
  if (lower.startsWith("mailto:")) return parseMailto(value) ?? text(raw);
  if (lower.startsWith("matmsg:")) return parseMatmsg(value) ?? text(raw);
  if (lower.startsWith("upi:")) return parseUpi(value) ?? text(raw);
  if (lower.startsWith("bitcoin:")) return parseBitcoin(value) ?? text(raw);
  if (lower.startsWith("ethereum:")) return parseEthereum(value) ?? text(raw);
  if (lower.startsWith("venmo:")) return parseVenmoApp(value) ?? text(raw);
  if (/^bcd\r?\n/i.test(value)) return parseEpc(value) ?? text(raw);

  const gs1 = parseGs1ElementString(value);
  if (gs1) return { kind: "gs1", data: gs1 };

  return text(raw);
}

function text(raw: string): ParsedScan {
  return { kind: "text", text: raw };
}

function decodeSafe(value: string): string {
  try {
    // Paths keep "+" literal (tel:+1…); only query strings use it for spaces.
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function params(query: string): URLSearchParams {
  return new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
}

/** Case-insensitive URLSearchParams lookup (payment QR codes vary in case). */
function param(search: URLSearchParams, name: string): string | undefined {
  for (const [key, value] of search) {
    if (key.toLowerCase() === name) return value.trim() || undefined;
  }
  return undefined;
}

// ─── Web links (incl. PayPal, Venmo, GS1 Digital Link) ──────────────────────

function parseWebLink(value: string): ParsedScan | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean).map(decodeSafe);

  if (
    host === "paypal.me" ||
    (host === "paypal.com" && segments[0]?.toLowerCase() === "paypalme")
  ) {
    const [user, amount] = host === "paypal.me" ? segments : segments.slice(1);
    if (user) {
      return {
        kind: "payment",
        scheme: "paypal",
        payee: user,
        amount,
        fields: compactFields([
          ["PayPal.Me", user],
          ["Amount", amount],
        ]),
        openUrl: url.toString(),
        copyValue: url.toString(),
      };
    }
  }

  if (host === "venmo.com" && segments.length > 0) {
    const user = segments[0]?.toLowerCase() === "u" ? segments[1] : segments[0];
    if (
      user &&
      !["about", "legal", "signup", "login", "account"].includes(
        user.toLowerCase(),
      )
    ) {
      const amount = param(url.searchParams, "amount");
      const note = param(url.searchParams, "note");
      return {
        kind: "payment",
        scheme: "venmo",
        payee: user,
        amount,
        fields: compactFields([
          ["Venmo user", user],
          ["Amount", amount],
          ["Note", note],
        ]),
        openUrl: url.toString(),
        copyValue: user,
      };
    }
  }

  const gs1 = parseGs1DigitalLink(url);
  return { kind: "url", url: url.toString(), ...(gs1 && { gs1 }) };
}

// ─── Wi-Fi ───────────────────────────────────────────────────────────────────

/** Splits "K:v;K:v;;" on unescaped `;`, unescaping `\;` `\,` `\:` `\\` `\"`. */
function splitEscaped(body: string, separator = ";"): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const char = body[i] as string;
    if (char === "\\" && i + 1 < body.length) {
      current += body[i + 1];
      i++;
    } else if (char === separator) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function keyValues(body: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of splitEscaped(body)) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const key = part.slice(0, colon).trim().toUpperCase();
    const list = map.get(key) ?? [];
    list.push(part.slice(colon + 1));
    map.set(key, list);
  }
  return map;
}

function parseWifi(value: string): ParsedScan | null {
  const fields = keyValues(value.slice(5));
  const ssid = fields.get("S")?.[0];
  if (!ssid) return null;
  const type = (fields.get("T")?.[0] ?? "").trim().toUpperCase();
  return {
    kind: "wifi",
    ssid,
    password: fields.get("P")?.[0] ?? "",
    security: type === "" || type === "NOPASS" ? "None" : type,
    hidden: (fields.get("H")?.[0] ?? "").trim().toLowerCase() === "true",
  };
}

// ─── Contacts ────────────────────────────────────────────────────────────────

interface ContentLine {
  name: string;
  params: string;
  value: string;
}

/** RFC 6350/5545 content lines: unfolds continuation lines, splits name;params:value. */
function contentLines(value: string): ContentLine[] {
  const unfolded = value.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "");
  const lines: ContentLine[] = [];
  for (const line of unfolded.split("\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const head = line.slice(0, colon);
    const semicolon = head.indexOf(";");
    // Drop group prefixes ("item1.TEL").
    const name = (semicolon === -1 ? head : head.slice(0, semicolon))
      .replace(/^.*\./, "")
      .toUpperCase();
    lines.push({
      name,
      params: semicolon === -1 ? "" : head.slice(semicolon + 1),
      value: line.slice(colon + 1),
    });
  }
  return lines;
}

function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\:])/g, (_, char: string) =>
    char === "n" || char === "N" ? "\n" : char,
  );
}

function parseVcard(value: string): ParsedScan | null {
  const lines = contentLines(value);
  const first = (name: string) => lines.find((line) => line.name === name);
  const all = (name: string) =>
    lines
      .filter((line) => line.name === name)
      .map((line) => unescapeText(line.value).trim())
      .filter(Boolean);

  const structuredName = first("N")
    ?.value.split(";")
    .map(unescapeText)
    .map((part) => part.trim());
  const name =
    unescapeText(first("FN")?.value ?? "").trim() ||
    [
      structuredName?.[3],
      structuredName?.[1],
      structuredName?.[2],
      structuredName?.[0],
    ]
      .filter(Boolean)
      .join(" ");
  const address = first("ADR")
    ?.value.split(";")
    .map(unescapeText)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  const contact: Contact = {
    name: name || "Unnamed contact",
    organization:
      unescapeText(first("ORG")?.value ?? "")
        .replace(/;/g, ", ")
        .trim() || undefined,
    title: unescapeText(first("TITLE")?.value ?? "").trim() || undefined,
    phones: all("TEL").map((tel) => tel.replace(/^tel:/i, "")),
    emails: all("EMAIL"),
    urls: all("URL"),
    address: address || undefined,
    note: unescapeText(first("NOTE")?.value ?? "").trim() || undefined,
  };

  let vcard = value.replace(/\r\n|\r|\n/g, "\r\n");
  if (!/END:VCARD\s*$/i.test(vcard)) vcard += "\r\nEND:VCARD";
  return { kind: "contact", format: "vcard", contact, vcard: `${vcard}\r\n` };
}

function parseMecard(value: string): ParsedScan | null {
  const fields = keyValues(value.slice(7));
  const rawName = fields.get("N")?.[0] ?? "";
  // MeCard names are "Last,First".
  const [last = "", firstName = ""] = rawName
    .split(",")
    .map((part) => part.trim());
  const name = [firstName, last].filter(Boolean).join(" ") || rawName.trim();
  if (!name && !fields.get("TEL") && !fields.get("EMAIL")) return null;

  const contact: Contact = {
    name: name || "Unnamed contact",
    organization: fields.get("ORG")?.[0]?.trim() || undefined,
    phones: (fields.get("TEL") ?? []).map((tel) => tel.trim()).filter(Boolean),
    emails: (fields.get("EMAIL") ?? [])
      .map((mail) => mail.trim())
      .filter(Boolean),
    urls: (fields.get("URL") ?? []).map((url) => url.trim()).filter(Boolean),
    address: fields.get("ADR")?.[0]?.trim() || undefined,
    note: fields.get("NOTE")?.[0]?.trim() || undefined,
  };
  return {
    kind: "contact",
    format: "mecard",
    contact,
    vcard: contactToVcard(contact, { last, first: firstName }),
  };
}

function escapeVcardText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** vCard 3.0 for a contact (MeCard has no file format of its own). */
export function contactToVcard(
  contact: Contact,
  name: { last: string; first: string } = { last: contact.name, first: "" },
): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVcardText(name.last)};${escapeVcardText(name.first)};;;`,
    `FN:${escapeVcardText(contact.name)}`,
    contact.organization && `ORG:${escapeVcardText(contact.organization)}`,
    contact.title && `TITLE:${escapeVcardText(contact.title)}`,
    ...contact.phones.map((phone) => `TEL:${escapeVcardText(phone)}`),
    ...contact.emails.map((email) => `EMAIL:${escapeVcardText(email)}`),
    ...contact.urls.map((url) => `URL:${escapeVcardText(url)}`),
    contact.address && `ADR:;;${escapeVcardText(contact.address)};;;;`,
    contact.note && `NOTE:${escapeVcardText(contact.note)}`,
    "END:VCARD",
  ].filter((line): line is string => Boolean(line));
  return `${lines.join("\r\n")}\r\n`;
}

// ─── Calendar events ─────────────────────────────────────────────────────────

/** "20261031T180000Z" / "20261031T180000" / "20261031" → ISO-ish string. */
export function parseIcalDate(
  value: string,
): { iso: string; allDay: boolean } | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(
    value.trim(),
  );
  if (!match) return null;
  const [, y, mo, d, h, mi, s, z] = match;
  if (!h) return { iso: `${y}-${mo}-${d}`, allDay: true };
  return {
    iso: `${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}${z ? "Z" : ""}`,
    allDay: false,
  };
}

function parseEvent(value: string): ParsedScan | null {
  const lines = contentLines(value);
  const begin = lines.findIndex(
    (line) =>
      line.name === "BEGIN" && line.value.trim().toUpperCase() === "VEVENT",
  );
  if (begin === -1) return null;
  const end = lines.findIndex(
    (line, index) =>
      index > begin &&
      line.name === "END" &&
      line.value.trim().toUpperCase() === "VEVENT",
  );
  const eventLines = lines.slice(begin + 1, end === -1 ? undefined : end);
  const get = (name: string) =>
    eventLines.find((line) => line.name === name)?.value;

  const start = parseIcalDate(get("DTSTART") ?? "");
  const finish = parseIcalDate(get("DTEND") ?? "");
  const event: CalendarEvent = {
    summary: unescapeText(get("SUMMARY") ?? "").trim() || "Untitled event",
    start: start?.iso,
    end: finish?.iso,
    location: unescapeText(get("LOCATION") ?? "").trim() || undefined,
    description: unescapeText(get("DESCRIPTION") ?? "").trim() || undefined,
    allDay: start?.allDay ?? false,
  };

  let ics = value.replace(/\r\n|\r|\n/g, "\r\n").trim();
  if (!/^BEGIN:VCALENDAR/i.test(ics)) {
    if (!/END:VEVENT$/i.test(ics)) ics += "\r\nEND:VEVENT";
    ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//QRdx//Scanner//EN\r\n${ics}\r\nEND:VCALENDAR`;
  } else if (!/END:VCALENDAR$/i.test(ics)) {
    ics += "\r\nEND:VCALENDAR";
  }
  return { kind: "event", event, ics: `${ics}\r\n` };
}

// ─── Location, phone, SMS, email ────────────────────────────────────────────

function parseGeo(value: string): ParsedScan | null {
  const [path = "", query = ""] = value.slice(4).split("?");
  const [coords = ""] = path.split(";");
  const [lat, lon] = coords.split(",").map((part) => Number(part.trim()));
  if (
    lat === undefined ||
    lon === undefined ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return null;
  }
  const label = param(params(query), "q");
  return { kind: "geo", lat, lon, ...(label && { label }) };
}

function parseSms(value: string): ParsedScan | null {
  const lower = value.toLowerCase();
  if (lower.startsWith("smsto:")) {
    // SMSTO:<number>:<message>
    const rest = value.slice(6);
    const colon = rest.indexOf(":");
    const number = (colon === -1 ? rest : rest.slice(0, colon)).trim();
    const body = colon === -1 ? "" : rest.slice(colon + 1);
    return number || body ? { kind: "sms", number, body } : null;
  }
  const [path = "", query = ""] = value.slice(4).split("?");
  const number = decodeSafe(path).trim();
  const body = param(params(query), "body") ?? "";
  return number || body ? { kind: "sms", number, body } : null;
}

function parseMailto(value: string): ParsedScan | null {
  const [path = "", query = ""] = value.slice(7).split("?");
  const search = params(query);
  const to = decodeSafe(path).trim() || (param(search, "to") ?? "");
  if (!to) return null;
  return {
    kind: "email",
    to,
    subject: param(search, "subject") ?? "",
    body: param(search, "body") ?? "",
  };
}

function parseMatmsg(value: string): ParsedScan | null {
  const fields = keyValues(value.slice(7));
  const to = fields.get("TO")?.[0]?.trim();
  if (!to) return null;
  return {
    kind: "email",
    to,
    subject: fields.get("SUB")?.[0] ?? "",
    body: fields.get("BODY")?.[0] ?? "",
  };
}

// ─── Payments ────────────────────────────────────────────────────────────────

function compactFields(entries: [string, string | undefined][]): Field[] {
  return entries
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => ({ label, value }));
}

function parseUpi(value: string): ParsedScan | null {
  const query = value.slice(value.indexOf("?") + 1);
  if (!value.includes("?")) return null;
  const search = params(query);
  const vpa = param(search, "pa");
  if (!vpa) return null;
  const amount = param(search, "am");
  const currency = param(search, "cu") ?? "INR";
  const name = param(search, "pn");
  return {
    kind: "payment",
    scheme: "upi",
    payee: name ?? vpa,
    amount: amount ? `${currency} ${amount}` : undefined,
    fields: compactFields([
      ["Payee", name],
      ["UPI ID", vpa],
      ["Amount", amount ? `${currency} ${amount}` : undefined],
      ["Note", param(search, "tn")],
      ["Reference", param(search, "tr")],
    ]),
    openUrl: value,
    copyValue: vpa,
  };
}

function parseBitcoin(value: string): ParsedScan | null {
  const [path = "", query = ""] = value.slice(8).split("?");
  const address = path.replace(/^\/\//, "").trim();
  if (!/^[a-zA-Z0-9]{14,90}$/.test(address)) return null;
  const search = params(query);
  const amount = param(search, "amount");
  return {
    kind: "payment",
    scheme: "bitcoin",
    payee: param(search, "label") ?? address,
    amount: amount ? `${amount} BTC` : undefined,
    fields: compactFields([
      ["Address", address],
      ["Amount", amount ? `${amount} BTC` : undefined],
      ["Label", param(search, "label")],
      ["Message", param(search, "message")],
    ]),
    openUrl: value,
    copyValue: address,
  };
}

/** Wei (integer or scientific notation) as an ETH string. */
export function formatWei(value: string): string | null {
  let wei: bigint;
  try {
    if (/^\d+$/.test(value)) {
      wei = BigInt(value);
    } else {
      const match = /^(\d+)(?:\.(\d+))?e(\d+)$/i.exec(value);
      if (!match) return null;
      const [, whole = "", fraction = "", exponent = "0"] = match;
      const shift = Number(exponent) - fraction.length;
      if (shift < 0) return null;
      wei = BigInt(whole + fraction) * 10n ** BigInt(shift);
    }
  } catch {
    return null;
  }
  const unit = 10n ** 18n;
  const whole = wei / unit;
  const fraction = (wei % unit).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function parseEthereum(value: string): ParsedScan | null {
  // EIP-681: ethereum:[pay-]<address>[@<chain>][/<function>][?<params>]
  const [path = "", query = ""] = value.slice(9).split("?");
  const match =
    /^(?:pay-)?(0x[0-9a-fA-F]{40}|[a-z0-9.-]+\.eth)(?:@(\d+))?(?:\/(\w+))?$/.exec(
      path,
    );
  if (!match) return null;
  const [, target = "", chainId, fn] = match;
  const search = params(query);
  const isTokenTransfer = fn === "transfer";
  const recipient = isTokenTransfer
    ? (param(search, "address") ?? target)
    : target;
  const rawValue = isTokenTransfer
    ? param(search, "uint256")
    : param(search, "value");
  const eth = !isTokenTransfer && rawValue ? formatWei(rawValue) : null;
  const amount = eth
    ? `${eth} ETH`
    : rawValue
      ? `${rawValue} (token units)`
      : undefined;
  return {
    kind: "payment",
    scheme: "ethereum",
    payee: recipient,
    amount,
    fields: compactFields([
      ["Recipient", recipient],
      ["Token contract", isTokenTransfer ? target : undefined],
      ["Amount", amount],
      ["Chain ID", chainId],
    ]),
    openUrl: value,
    copyValue: recipient,
  };
}

function parseVenmoApp(value: string): ParsedScan | null {
  const search = params(value.slice(value.indexOf("?") + 1));
  const user = param(search, "recipients");
  if (!value.includes("?") || !user) return null;
  const amount = param(search, "amount");
  return {
    kind: "payment",
    scheme: "venmo",
    payee: user,
    amount,
    fields: compactFields([
      ["Venmo user", user],
      ["Amount", amount],
      ["Note", param(search, "note")],
    ]),
    openUrl: value,
    copyValue: user,
  };
}

/** EPC069-12 "SEPA credit transfer" QR (the "Girocode"). */
function parseEpc(value: string): ParsedScan | null {
  const lines = value.split(/\r\n|\r|\n/);
  if (lines[0]?.trim() !== "BCD" || lines[3]?.trim() !== "SCT") return null;
  const bic = lines[4]?.trim();
  const name = lines[5]?.trim();
  const iban = lines[6]?.replace(/\s+/g, "").toUpperCase();
  if (!name || !iban) return null;
  const rawAmount = lines[7]?.trim();
  const amountMatch = rawAmount
    ? /^([A-Z]{3})(\d+(?:\.\d{1,2})?)$/.exec(rawAmount)
    : null;
  const amount = amountMatch
    ? `${amountMatch[1]} ${amountMatch[2]}`
    : undefined;
  return {
    kind: "payment",
    scheme: "epc",
    payee: name,
    amount,
    fields: compactFields([
      ["Beneficiary", name],
      ["IBAN", iban],
      ["BIC", bic],
      ["Amount", amount],
      ["Reference", lines[9]?.trim()],
      ["Remittance info", lines[10]?.trim()],
    ]),
    copyValue: iban,
  };
}

// ─── GS1 ─────────────────────────────────────────────────────────────────────

interface AiSpec {
  label: string;
  /** Fixed data length; undefined = variable (ends at GS or end of data). */
  length?: number;
  date?: boolean;
}

const GS1_AIS: Record<string, AiSpec> = {
  "00": { label: "SSCC", length: 18 },
  "01": { label: "GTIN", length: 14 },
  "02": { label: "GTIN of contained items", length: 14 },
  "10": { label: "Batch / lot" },
  "11": { label: "Production date", length: 6, date: true },
  "13": { label: "Packaging date", length: 6, date: true },
  "15": { label: "Best before", length: 6, date: true },
  "16": { label: "Sell by", length: 6, date: true },
  "17": { label: "Expiry date", length: 6, date: true },
  "20": { label: "Variant", length: 2 },
  "21": { label: "Serial number" },
  "22": { label: "Consumer product variant" },
  "30": { label: "Count" },
  "37": { label: "Count of trade items" },
  "240": { label: "Additional product ID" },
  "241": { label: "Customer part number" },
  "400": { label: "Order number" },
  "410": { label: "Ship to (GLN)", length: 13 },
  "414": { label: "Location (GLN)", length: 13 },
  "422": { label: "Country of origin", length: 3 },
  "7003": { label: "Expiry date and time", length: 10 },
};

const DIGITAL_LINK_ALIASES: Record<string, string> = {
  gtin: "01",
  lot: "10",
  ser: "21",
  exp: "17",
  sscc: "00",
};

function aiSpec(ai: string): AiSpec | undefined {
  if (GS1_AIS[ai]) return GS1_AIS[ai];
  // 310n–369n: measures with n implied decimals (e.g. 3102 = net weight kg, 2 decimals).
  if (/^3[1-6]\d\d$/.test(ai)) {
    return {
      label: ai.startsWith("310") ? "Net weight (kg)" : `Measure (AI ${ai})`,
      length: 6,
    };
  }
  if (/^9\d$/.test(ai)) return { label: "Company internal" };
  return undefined;
}

function formatAiValue(ai: string, spec: AiSpec, value: string): string {
  if (spec.date && /^\d{6}$/.test(value)) {
    const year = `20${value.slice(0, 2)}`;
    const month = value.slice(2, 4);
    const day = value.slice(4, 6);
    return day === "00" ? `${year}-${month}` : `${year}-${month}-${day}`;
  }
  if (/^3[1-6]\d\d$/.test(ai) && /^\d{6}$/.test(value)) {
    const decimals = Number(ai[3]);
    const number = Number(value) / 10 ** decimals;
    return String(number);
  }
  return value;
}

function gs1Result(pairs: [string, string][]): Gs1Data | null {
  const fields: Field[] = [];
  let gtin: string | undefined;
  for (const [ai, value] of pairs) {
    const spec = aiSpec(ai);
    if (!spec || !value) continue;
    if (ai === "01") gtin = value;
    fields.push({ label: spec.label, value: formatAiValue(ai, spec, value) });
  }
  return fields.length > 0 ? { fields, ...(gtin && { gtin }) } : null;
}

const GS = "\u001d";

/** "(01)09506000134352(17)261231(10)ABC" or the GS-separated raw form. */
export function parseGs1ElementString(input: string): Gs1Data | null {
  const value = input.replace(/^\][A-Za-z]\d/, "");
  if (/^\(\d{2,4}\)/.test(value)) {
    const pairs: [string, string][] = [];
    for (const match of value.matchAll(/\((\d{2,4})\)([^(]*)/g)) {
      pairs.push([match[1] as string, (match[2] as string).trim()]);
    }
    return gs1Result(pairs);
  }

  // The raw form needs a GS separator or a symbology prefix to be told apart
  // from plain digits.
  if (!value.includes(GS) && value === input) return null;
  if (!/^\d{2}/.test(value)) return null;
  const pairs: [string, string][] = [];
  let rest = value.replace(new RegExp(`^${GS}`), "");
  while (rest.length > 0) {
    const ai = [4, 3, 2]
      .map((length) => rest.slice(0, length))
      .find((candidate) => aiSpec(candidate));
    if (!ai) break;
    const spec = aiSpec(ai) as AiSpec;
    rest = rest.slice(ai.length);
    let data: string;
    if (spec.length) {
      data = rest.slice(0, spec.length);
      rest = rest.slice(spec.length);
      if (rest.startsWith(GS)) rest = rest.slice(1);
    } else {
      const end = rest.indexOf(GS);
      data = end === -1 ? rest : rest.slice(0, end);
      rest = end === -1 ? "" : rest.slice(end + 1);
    }
    pairs.push([ai, data]);
  }
  return pairs.length > 0 ? gs1Result(pairs) : null;
}

/** GS1 Digital Link URI: https://<any host>/01/<gtin>[/10/<lot>][/21/<serial>][?17=...]. */
export function parseGs1DigitalLink(url: URL): Gs1Data | null {
  const segments = url.pathname.split("/").filter(Boolean).map(decodeSafe);
  const start = segments.findIndex((segment, index) => {
    const ai = DIGITAL_LINK_ALIASES[segment] ?? segment;
    return (
      (ai === "01" || ai === "00") &&
      /^\d{8,18}$/.test(segments[index + 1] ?? "")
    );
  });
  if (start === -1) return null;
  const pairs: [string, string][] = [];
  for (let i = start; i + 1 < segments.length; i += 2) {
    const ai =
      DIGITAL_LINK_ALIASES[segments[i] as string] ?? (segments[i] as string);
    if (!aiSpec(ai)) break;
    const data = segments[i + 1] as string;
    pairs.push([ai, ai === "01" ? data.padStart(14, "0") : data]);
  }
  for (const [key, data] of url.searchParams) {
    const ai = DIGITAL_LINK_ALIASES[key] ?? key;
    if (/^\d{2,4}$/.test(ai) && aiSpec(ai)) pairs.push([ai, data]);
  }
  return gs1Result(pairs);
}

/** GTIN-8/12/13/14 mod-10 check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop() as number;
  const sum = digits
    .reverse()
    .reduce(
      (total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1),
      0,
    );
  return (10 - (sum % 10)) % 10 === check;
}

/** One-line summary for lists, history and CSV. */
export function summarizeScan(parsed: ParsedScan): string {
  switch (parsed.kind) {
    case "url":
      return parsed.url;
    case "wifi":
      return parsed.ssid;
    case "contact":
      return parsed.contact.name;
    case "event":
      return parsed.event.summary;
    case "geo":
      return parsed.label ?? `${parsed.lat}, ${parsed.lon}`;
    case "phone":
      return parsed.number;
    case "sms":
      return parsed.number || parsed.body;
    case "email":
      return parsed.to;
    case "payment":
      return parsed.amount
        ? `${parsed.payee} · ${parsed.amount}`
        : parsed.payee;
    case "gs1":
      return parsed.data.gtin
        ? `GTIN ${parsed.data.gtin}`
        : (parsed.data.fields[0]?.value ?? "");
    case "product":
      return parsed.code;
    case "text":
      return parsed.text;
  }
}
