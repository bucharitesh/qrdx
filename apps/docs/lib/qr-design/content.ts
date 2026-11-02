// What a QR code opens, for the AI chat and the MCP `design_qr` tool: every
// content type the editor offers, validated with the same zod schemas its
// forms use (lib/validations/qr-content.ts) and the encoder's own checks
// (field formats, WPA password length, payload size), then encoded exactly
// as the editor encodes it.
import { z } from "zod";
import {
  amazonSchema,
  attendanceSchema,
  bitcoinSchema,
  calcomSchema,
  dubshSchema,
  emailSchema,
  ethereumSchema,
  etsySchema,
  facebookSchema,
  flipkartSchema,
  googleDriveSchema,
  googleReviewSchema,
  instagramSchema,
  linkedinSchema,
  mapsSchema,
  paypalSchema,
  phoneSchema,
  pinterestSchema,
  redditSchema,
  smsSchema,
  snapchatSchema,
  spotifySchema,
  textSchema,
  threadsSchema,
  tiktokSchema,
  twitterSchema,
  upiSchema,
  urlSchema,
  vcardSchema,
  venmoSchema,
  whatsappSchema,
  wifiSchema,
  youtubeSchema,
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
}

function fieldsOf(type: ContentType): ContentField[] {
  return Object.entries(shapeOf(CONTENT_FORM_SCHEMAS[type]))
    .filter(([name]) => !INTERNAL_FIELDS.has(name))
    .map(([name, schema]) => {
      const optional = schema.safeParse(undefined).success;
      const values =
        schema instanceof z.ZodEnum ? (schema.options as string[]) : undefined;
      const kind = schema.safeParse(true).success ? "boolean" : "string";
      return {
        name,
        // Either-or types (Reddit, YouTube) have only optional fields.
        required: !optional,
        kind,
        ...(values ? { values } : {}),
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

const FIELD_DESCRIPTIONS: Record<string, string> = {
  url: "Web address (url, google-drive); website (vcard)",
  text: "Plain text",
  recipient: "Email address (comma-separate several)",
  subject: "Email subject",
  body: "Email body",
  phoneNumber: "Phone number, international format, e.g. +14155550123",
  message: "Prefilled message (sms, whatsapp) or payment message (bitcoin)",
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
  location: "Address or 'lat,long'",
  profileUrl: "Profile URL",
  username: "Username or handle",
  subreddit: "Subreddit name",
  channelUrl: "YouTube channel URL",
  videoUrl: "YouTube video URL",
  upiId: "UPI ID, e.g. name@bank",
  name: "Payee name (upi) or file name (google-drive)",
  amount: "Amount, digits only",
  paypalUrl: "PayPal.me link",
  placeId: "Google Maps place ID",
  uri: "Spotify URI or URL",
  label: "Bitcoin payment label",
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
      (name === "hidden" ? z.boolean() : z.string())
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
