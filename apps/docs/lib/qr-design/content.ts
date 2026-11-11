// What a QR code opens, for the AI chat and the MCP `design_qr` tool: every
// content type the editor offers, validated with the same zod schemas its
// forms use (lib/validations/qr-content.ts) and the encoder's own checks
// (field formats, WPA password length, payload size), then encoded exactly
// as the editor encodes it.
import { z } from "zod";
import {
  amazonSchema,
  attendanceSchema,
  bitcoincashSchema,
  bitcoinSchema,
  blueskySchema,
  calcomSchema,
  cashappSchema,
  discordSchema,
  dogecoinSchema,
  dubshSchema,
  emailSchema,
  ethereumSchema,
  etsySchema,
  facebookSchema,
  flipkartSchema,
  googleDriveSchema,
  googleMeetSchema,
  googleReviewSchema,
  instagramSchema,
  lineSchema,
  linkedinSchema,
  litecoinSchema,
  mapsSchema,
  mastodonSchema,
  moneroSchema,
  paynowSchema,
  paypalSchema,
  phoneSchema,
  pinterestSchema,
  pixSchema,
  promptpaySchema,
  redditSchema,
  revolutSchema,
  sepaSchema,
  signalSchema,
  smsSchema,
  snapchatSchema,
  solanaSchema,
  soundcloudSchema,
  spotifySchema,
  telegramSchema,
  textSchema,
  threadsSchema,
  tiktokSchema,
  twitchSchema,
  twitterSchema,
  upiSchema,
  urlSchema,
  vcardSchema,
  venmoSchema,
  vietqrSchema,
  wazeSchema,
  whatsappSchema,
  wifiSchema,
  youtubeSchema,
  zoomSchema,
} from "@/lib/validations/qr-content";
import {
  CONTENT_TYPES_METADATA,
  type ContentType,
  type QRContentConfig,
} from "@/types/qr-content";
import { encodeQRContent, validateContent } from "@/utils/qr-content-encoder";

/** The form schema behind each content type. */
export const CONTENT_FORM_SCHEMAS = {
  url: urlSchema,
  text: textSchema,
  email: emailSchema,
  phone: phoneSchema,
  sms: smsSchema,
  whatsapp: whatsappSchema,
  wifi: wifiSchema,
  vcard: vcardSchema,
  maps: mapsSchema,
  facebook: facebookSchema,
  instagram: instagramSchema,
  reddit: redditSchema,
  tiktok: tiktokSchema,
  twitter: twitterSchema,
  linkedin: linkedinSchema,
  youtube: youtubeSchema,
  pinterest: pinterestSchema,
  snapchat: snapchatSchema,
  threads: threadsSchema,
  upi: upiSchema,
  paypal: paypalSchema,
  "google-review": googleReviewSchema,
  venmo: venmoSchema,
  spotify: spotifySchema,
  bitcoin: bitcoinSchema,
  ethereum: ethereumSchema,
  etsy: etsySchema,
  dubsh: dubshSchema,
  attendance: attendanceSchema,
  amazon: amazonSchema,
  flipkart: flipkartSchema,
  calcom: calcomSchema,
  "google-drive": googleDriveSchema,
  // Added 2026-11-11
  pix: pixSchema,
  sepa: sepaSchema,
  paynow: paynowSchema,
  promptpay: promptpaySchema,
  vietqr: vietqrSchema,
  cashapp: cashappSchema,
  revolut: revolutSchema,
  telegram: telegramSchema,
  signal: signalSchema,
  discord: discordSchema,
  line: lineSchema,
  bluesky: blueskySchema,
  mastodon: mastodonSchema,
  twitch: twitchSchema,
  soundcloud: soundcloudSchema,
  zoom: zoomSchema,
  "google-meet": googleMeetSchema,
  waze: wazeSchema,
  litecoin: litecoinSchema,
  dogecoin: dogecoinSchema,
  bitcoincash: bitcoincashSchema,
  solana: solanaSchema,
  monero: moneroSchema,
} satisfies Record<ContentType, z.ZodType>;

export const CONTENT_TYPE_IDS = Object.keys(CONTENT_FORM_SCHEMAS) as [
  ContentType,
  ...ContentType[],
];

/**
 * Fields the editor fills in itself (Dub and Google Drive pickers), never
 * from typed input.
 */
const INTERNAL_FIELDS = new Set([
  "source",
  "dubLinkId",
  "domain",
  "key",
  "destinationUrl",
  "qrCodeUrl",
  "fileId",
  "mimeType",
]);

/** The object shape of a form schema (refined objects keep it). */
function shapeOf(schema: z.ZodType): Record<string, z.ZodType> {
  return (schema as unknown as { shape: Record<string, z.ZodType> }).shape;
}

export interface ContentField {
  name: string;
  required: boolean;
  /** Allowed values, for enum fields */
  values?: string[];
  kind: "string" | "boolean";
  /** The form sends it even when empty, so a missing value means "" */
  emptyByDefault?: boolean;
}

function fieldsOf(type: ContentType): ContentField[] {
  return Object.entries(shapeOf(CONTENT_FORM_SCHEMAS[type]))
    .filter(([name]) => !INTERNAL_FIELDS.has(name))
    .map(([name, schema]) => {
      const optional = schema.safeParse(undefined).success;
      // An optional choice (PayNow's proxyType) still lists its values.
      const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema;
      const values =
        inner instanceof z.ZodEnum ? (inner.options as string[]) : undefined;
      const kind = schema.safeParse(true).success ? "boolean" : "string";
      // A field the form always sends, possibly empty (a Wi-Fi password).
      const emptyByDefault = !optional && schema.safeParse("").success;
      return {
        name,
        // Either-or types (Reddit, YouTube) have only optional fields.
        required: !optional && !emptyByDefault,
        kind,
        ...(values ? { values } : {}),
        ...(emptyByDefault ? { emptyByDefault } : {}),
      };
    });
}

export const CONTENT_FIELDS: Record<ContentType, ContentField[]> =
  Object.fromEntries(
    CONTENT_TYPE_IDS.map((type) => [type, fieldsOf(type)]),
  ) as Record<ContentType, ContentField[]>;

const LABELS = new Map(
  CONTENT_TYPES_METADATA.map((item) => [item.type, item.label]),
);

export function contentTypeLabel(type: ContentType): string {
  return LABELS.get(type) ?? type;
}

/** Every content type with its fields, for list_options and tool descriptions. */
export function contentCatalog() {
  return CONTENT_TYPE_IDS.map((type) => ({
    type,
    label: contentTypeLabel(type),
    fields: CONTENT_FIELDS[type],
  }));
}

/** One line per type: `wifi (WiFi): ssid*, password, encryption=WPA|WEP|nopass, hidden` */
export function contentFieldGuide(): string {
  return CONTENT_TYPE_IDS.map((type) => {
    const fields = CONTENT_FIELDS[type]
      .map(
        (field) =>
          `${field.name}${field.required ? "*" : ""}${
            field.values ? `=${field.values.join("|")}` : ""
          }${field.kind === "boolean" ? " (true/false)" : ""}`,
      )
      .join(", ");
    return `${type} (${contentTypeLabel(type)}): ${fields}`;
  }).join("\n");
}

const ALL_FIELD_NAMES = [
  ...new Set(
    CONTENT_TYPE_IDS.flatMap((type) =>
      CONTENT_FIELDS[type].map((field) => field.name),
    ),
  ),
].sort();

/** Fields that are true/false (Wi-Fi's hidden, PayNow's editable, …). */
const BOOLEAN_FIELD_NAMES = new Set(
  CONTENT_TYPE_IDS.flatMap((type) =>
    CONTENT_FIELDS[type]
      .filter((field) => field.kind === "boolean")
      .map((field) => field.name),
  ),
);

const FIELD_DESCRIPTIONS: Record<string, string> = {
  url: "Web address (url, google-drive); website (vcard)",
  text: "Plain text",
  recipient: "Email address (comma-separate several)",
  subject: "Email subject",
  body: "Email body",
  phoneNumber: "Phone number, international format, e.g. +14155550123",
  message:
    "Prefilled message (sms, whatsapp) or payment message (bitcoin, crypto, pix, vietqr)",
  ssid: "Wi-Fi network name",
  password: "Wi-Fi password (8-63 characters for WPA)",
  encryption: "Wi-Fi security: WPA (WPA/WPA2/WPA3), WEP or nopass (open)",
  hidden: "Wi-Fi network is hidden",
  firstName: "Contact first name",
  lastName: "Contact last name",
  organization: "Contact company",
  phone: "Contact phone",
  email: "Contact email",
  address: "Contact street address, or a crypto wallet address",
  note: "Note (vcard, upi, venmo)",
  // Added 2026-11-11
  pixKey: "Pix key: CPF, CNPJ, +55 phone, email or random key",
  city: "Receiver city (pix), up to 15 characters",
  txid: "Pix transaction ID, up to 25 letters and digits",
  iban: "IBAN (sepa)",
  bic: "BIC (sepa), optional",
  reference:
    "Structured RF creditor reference (sepa) or bill reference (paynow)",
  remittance: "Payment reference text (sepa), up to 140 characters",
  proxyType: "Who gets paid: paynow mobile|uen, promptpay mobile|id|ewallet",
  proxy: "Mobile number, UEN (paynow) or national/tax/e-wallet ID (promptpay)",
  editable: "Whether the payer may change the amount (paynow)",
  expiry: "Last day the code works, YYYY-MM-DD (paynow)",
  bankBin: "The bank's 6-digit BIN (vietqr)",
  accountType: "account or card (vietqr)",
  accountNumber: "Bank account or card number (vietqr)",
  link: "signal.me username link or signal.group link (signal)",
  invite: "Discord invite link or code",
  handle: "Handle: alice.bsky.social (bluesky) or @alice@mastodon.social",
  meeting: "Meeting ID or invite link (zoom), or meeting code (google-meet)",
  navigate: "Start directions right away (waze), default true",
  location: "Address or 'lat,long'",
  profileUrl: "Profile URL",
  username:
    "Username or handle; LINE ID (line), $Cashtag (cashapp), SoundCloud profile or link",
  subreddit: "Subreddit name",
  channelUrl: "YouTube channel URL",
  videoUrl: "YouTube video URL",
  upiId: "UPI ID, e.g. name@bank",
  name: "Payee name (upi, paynow), receiver (pix), beneficiary (sepa) or file name (google-drive)",
  amount:
    "Amount in the payment's currency, digits and an optional decimal point",
  paypalUrl: "PayPal.me link",
  placeId: "Google Maps place ID",
  uri: "Spotify URI or URL",
  label: "Payment label (bitcoin and other crypto)",
  gas: "Ethereum gas limit",
  shopUrl: "Etsy shop URL",
  shortUrl: "Dub short link URL",
  formUrl: "Google Form URL",
  productUrl: "Product page URL",
  bookingUrl: "Cal.com booking URL",
};

/**
 * Content as tools take it: the type plus a flat set of optional fields.
 * Flat on purpose: no unions or records, so every model provider's tool
 * schema format accepts it. Each type's own schema validates it after.
 */
export const contentInputSchema = z.object({
  type: z
    .enum(CONTENT_TYPE_IDS)
    .describe("What the code opens. Fields per type are in the description."),
  ...Object.fromEntries(
    ALL_FIELD_NAMES.map((name) => [
      name,
      (BOOLEAN_FIELD_NAMES.has(name) ? z.boolean() : z.string())
        .optional()
        .describe(FIELD_DESCRIPTIONS[name] ?? name),
    ]),
  ),
}) as z.ZodType<ContentInput>;

export type ContentInput = { type: ContentType } & Record<
  string,
  string | boolean | undefined
>;

export interface ContentIssue {
  field?: string;
  message: string;
}

export type ContentResult =
  | {
      ok: true;
      content: QRContentConfig;
      /** The encoded payload the code holds */
      value: string;
    }
  | { ok: false; type: ContentType; issues: ContentIssue[] };

/** Validates content the way the editor's form for its type does. */
export function validateDesignContent(input: ContentInput): ContentResult {
  const { type, ...raw } = input;
  const schema = CONTENT_FORM_SCHEMAS[type];
  if (!schema) {
    return {
      ok: false,
      type,
      issues: [{ message: `Unknown content type "${type}"` }],
    };
  }
  const allowed = new Set(CONTENT_FIELDS[type].map((field) => field.name));
  const fields: Record<string, string | boolean> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined || value === null) continue;
    if (!allowed.has(name)) continue;
    fields[name] = typeof value === "string" ? value.trim() : value;
  }
  // As the form does: an open network's password is sent, empty.
  for (const field of CONTENT_FIELDS[type]) {
    if (field.emptyByDefault && fields[field.name] === undefined) {
      fields[field.name] = "";
    }
  }
  const parsed = schema.safeParse(fields);
  if (!parsed.success) {
    return {
      ok: false,
      type,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || undefined,
        message: issue.message,
      })),
    };
  }
  const content = { type, ...(parsed.data as object) } as QRContentConfig;
  const checked = validateContent(content);
  if (!checked.valid) {
    return {
      ok: false,
      type,
      issues: [{ message: checked.error ?? "Invalid content" }],
    };
  }
  return { ok: true, content, value: encodeQRContent(content) };
}

/** A short, non-secret description of content: "WiFi · Cafe Guest". */
export function describeContent(content: QRContentConfig): string {
  const label = contentTypeLabel(content.type);
  const detail = (() => {
    switch (content.type) {
      case "wifi":
        return content.ssid;
      case "vcard":
        return [content.firstName, content.lastName].filter(Boolean).join(" ");
      case "url":
        return content.url;
      case "email":
        return content.recipient;
      case "phone":
      case "sms":
      case "whatsapp":
        return content.phoneNumber;
      case "text":
        return content.text.length > 40
          ? `${content.text.slice(0, 40)}…`
          : content.text;
      // Bank codes: the receiver's name, never the key or account number.
      case "pix":
      case "sepa":
        return content.name;
      case "paynow":
        return content.name ?? "";
      case "promptpay":
      case "vietqr":
        return "";
      default: {
        const first = Object.entries(content).find(
          ([key, value]) =>
            key !== "type" && typeof value === "string" && value.length > 0,
        );
        return typeof first?.[1] === "string" ? first[1] : "";
      }
    }
  })();
  return detail ? `${label} · ${detail}` : label;
}
