/**
 * QR Content Encoder Utilities
 * Encodes various content types into QR-compatible string formats
 */

import type {
  AmazonContent,
  AttendanceContent,
  BitcoinContent,
  BlueskyContent,
  CalcomContent,
  CashAppContent,
  DiscordContent,
  DubshContent,
  EmailContent,
  EthereumContent,
  EtsyContent,
  FacebookContent,
  FlipkartContent,
  GoogleDriveContent,
  GoogleMeetContent,
  GoogleReviewContent,
  InstagramContent,
  LineContent,
  LinkedInContent,
  MapsContent,
  MastodonContent,
  PayPalContent,
  PhoneContent,
  PinterestContent,
  QRContentConfig,
  RedditContent,
  RevolutContent,
  SignalContent,
  SmsContent,
  SnapchatContent,
  SoundCloudContent,
  SpotifyContent,
  TelegramContent,
  TextContent,
  ThreadsContent,
  TikTokContent,
  TwitchContent,
  TwitterContent,
  UPIContent,
  UrlContent,
  VCardContent,
  VenmoContent,
  WazeContent,
  WhatsAppContent,
  WifiContent,
  YouTubeContent,
  ZoomContent,
} from "@/types/qr-content";
import {
  encodePayNow,
  encodePix,
  encodePromptPay,
  encodeSepa,
  encodeVietQr,
  payNowIssue,
  pixIssue,
  promptPayIssue,
  sepaIssue,
  vietQrIssue,
} from "./payment-qr-codes";

/** Largest payload a QR code holds (version 40-L, byte mode). */
export const MAX_QR_PAYLOAD_BYTES = 2953;

/** IDN hosts become punycode (RFC 5891) so every scanner sees a valid URL. */
function asciiHost(url: string): string {
  const match = /^([a-z][a-z\d+.-]*:\/\/)([^/?#@]*)(.*)$/is.exec(url);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII range check
  if (!match || /^[\x00-\x7f]*$/.test(match[2] as string)) return url;
  try {
    return `${match[1]}${new URL(`${match[1]}${match[2]}`).host}${match[3]}`;
  } catch {
    return url;
  }
}

/**
 * Trims a web address and adds https:// when it has no scheme, as browsers
 * do. "host:port" is not mistaken for a scheme; query and fragment are kept.
 */
export function normalizeWebUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const scheme = /^([a-z][a-z\d+.-]*):(.*)$/is.exec(value);
  const hasScheme =
    scheme !== null &&
    !(scheme[1] as string).includes(".") &&
    !/^\d+(?:[/?#]|$)/.test(scheme[2] as string);
  return asciiHost(hasScheme ? value : `https://${value}`);
}

/** A full URL as given, or `base` + handle when only a username is typed. */
function profileUrl(raw: string, base: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/[./:]/.test(value)) return normalizeWebUrl(value);
  return `${base}${encodeURIComponent(value.replace(/^@/, ""))}`;
}

/** `value` as a literal inside a RegExp: every special character escaped. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The bare handle from "@name", "name", or a pasted profile URL on `host`
 * (e.g. "https://www.instagram.com/name/?igsh=…" → "name").
 */
function handleFrom(raw: string, host: string, prefix = ""): string {
  let value = raw.trim();
  const url = new RegExp(
    `^(?:https?://)?(?:[\\w-]+\\.)*${escapeRegExp(host)}/+${prefix}([^/?#]+)`,
    "i",
  ).exec(value);
  if (url) value = url[1] as string;
  return value.replace(/^@/, "").replace(/\/+$/, "");
}

/**
 * Phone number for tel:/sms: URIs (RFC 3966): visual separators removed, a
 * single leading "+", the international "00" prefix written as "+" (E.164),
 * and an extension ("ext 12", "x12") kept apart.
 */
export function normalizePhone(raw: string): {
  number: string;
  extension?: string;
} {
  const match = /^(.*?)(?:\s*(?:ext\.?|extension|x)\s*(\d+))?\s*$/is.exec(
    raw.trim(),
  );
  let number = (match?.[1] ?? "").replace(/[^\d+]/g, "");
  number = number.replace(/(?!^)\+/g, "");
  if (number.startsWith("00")) number = `+${number.slice(2)}`;
  if (!/\d/.test(number)) return { number: "" };
  return match?.[2] ? { number, extension: match[2] } : { number };
}

/**
 * Encode URL content: trimmed, https:// added when missing
 */
export function encodeUrl(content: UrlContent): string {
  return normalizeWebUrl(content.url || "");
}

/** Addresses for a mailto: URI: "@", "+" and "," stay readable (RFC 6068). */
function encodeMailtoAddresses(raw: string): string {
  return raw
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .map((address) =>
      encodeURIComponent(address).replace(/%40/g, "@").replace(/%2B/gi, "+"),
    )
    .join(",");
}

/**
 * Encode Email content into a mailto: URI (RFC 6068)
 */
export function encodeEmail(content: EmailContent): string {
  const to = encodeMailtoAddresses(content.recipient || "");
  if (!to) return "";

  const params: string[] = [];
  if (content.subject) {
    params.push(`subject=${encodeURIComponent(content.subject)}`);
  }
  if (content.body) {
    // RFC 6068 §5: line breaks in the body are encoded as %0D%0A.
    const body = content.body.replace(/\r\n|\r|\n/g, "\r\n");
    params.push(`body=${encodeURIComponent(body)}`);
  }

  const queryString = params.length > 0 ? `?${params.join("&")}` : "";
  return `mailto:${to}${queryString}`;
}

/**
 * Encode Phone content into a tel: URI (RFC 3966)
 */
export function encodePhone(content: PhoneContent): string {
  const { number, extension } = normalizePhone(content.phoneNumber || "");
  if (!number) return "";
  return `tel:${number}${extension ? `;ext=${extension}` : ""}`;
}

/**
 * Encode SMS content
 */
export function encodeSms(content: SmsContent): string {
  const { number } = normalizePhone(content.phoneNumber || "");
  if (!number) return "";

  // Different formats for iOS and Android compatibility
  if (content.message) {
    // SMSTO format is more widely supported
    return `SMSTO:${number}:${content.message}`;
  }
  return `sms:${number}`;
}

/**
 * Encode WhatsApp content as a wa.me click-to-chat link
 */
export function encodeWhatsApp(content: WhatsAppContent): string {
  // wa.me wants the full international number: digits only, no "+" or "00".
  const number = normalizePhone(content.phoneNumber || "").number.replace(
    /^\+/,
    "",
  );
  if (!number) return "";

  if (content.message) {
    return `https://wa.me/${number}?text=${encodeURIComponent(content.message)}`;
  }
  return `https://wa.me/${number}`;
}

/**
 * Encode WiFi content into WIFI: format
 * Format: WIFI:T:<encryption>;S:<ssid>;P:<password>;H:<hidden>;
 */
export function encodeWifi(content: WifiContent): string {
  if (!content.ssid) return "";

  const encryption = content.encryption || "WPA";
  const password = content.password || "";
  const hidden = content.hidden ? "true" : "false";

  // Escape special characters in SSID and password
  const escapedSsid = escapeWifiString(content.ssid);
  const escapedPassword = escapeWifiString(password);

  if (encryption === "nopass") {
    return `WIFI:T:nopass;S:${escapedSsid};${content.hidden ? "H:true;" : ""};`;
  }

  return `WIFI:T:${encryption};S:${escapedSsid};P:${escapedPassword};H:${hidden};;`;
}

/**
 * Helper to escape special characters in WiFi strings
 */
function escapeWifiString(str: string): string {
  // Escape backslash, semicolon, comma, colon, and quotes
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/:/g, "\\:")
    .replace(/"/g, '\\"');
}

/** vCard TEXT escaping (RFC 2426 §4, RFC 6350 §3.4): \ , ; and newlines. */
function escapeVCardText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

const utf8 = new TextEncoder();

/** Folds a content line at 75 octets without splitting UTF-8 characters. */
function foldVCardLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = utf8.encode(char).length;
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

/**
 * Encode vCard content into VCARD 3.0 format (RFC 2426): escaped values,
 * CRLF line endings, lines folded at 75 octets
 */
export function encodeVCard(content: VCardContent): string {
  const firstName = content.firstName?.trim();
  if (!firstName) return "";
  const lastName = content.lastName?.trim() ?? "";
  const single = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

  const lines: string[] = [];
  lines.push("BEGIN:VCARD");
  lines.push("VERSION:3.0");

  // Name (required)
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  lines.push(`FN:${escapeVCardText(fullName)}`);
  lines.push(`N:${escapeVCardText(lastName)};${escapeVCardText(firstName)};;;`);

  // Organization
  if (content.organization?.trim()) {
    lines.push(`ORG:${escapeVCardText(content.organization.trim())}`);
  }

  // Phone
  if (content.phone?.trim()) {
    lines.push(`TEL;TYPE=CELL:${single(content.phone)}`);
  }

  // Email
  if (content.email?.trim()) {
    lines.push(`EMAIL:${single(content.email)}`);
  }

  // URL (a URI, not TEXT: commas stay as they are)
  if (content.url?.trim()) {
    lines.push(`URL:${single(content.url)}`);
  }

  // Address
  if (content.address?.trim()) {
    lines.push(`ADR:;;${escapeVCardText(content.address.trim())};;;;`);
  }

  // Note
  if (content.note?.trim()) {
    lines.push(`NOTE:${escapeVCardText(content.note.trim())}`);
  }

  lines.push("END:VCARD");

  return `${lines.map(foldVCardLine).join("\r\n")}\r\n`;
}

/**
 * Encode Maps content into Google Maps URL
 */
export function encodeMaps(content: MapsContent): string {
  const location = content.location?.trim();
  if (!location) return "";

  // Coordinates ("lat, long") within the WGS 84 ranges of RFC 5870 §3.4.2
  const coords = /^([+-]?\d+(?:\.\d+)?),\s*([+-]?\d+(?:\.\d+)?)$/.exec(
    location,
  );
  if (
    coords &&
    Math.abs(Number(coords[1])) <= 90 &&
    Math.abs(Number(coords[2])) <= 180
  ) {
    const strip = (value: string) => value.replace(/^\+/, "");
    return `https://www.google.com/maps?q=${strip(coords[1] as string)},${strip(coords[2] as string)}`;
  }

  // Otherwise treat as address
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

/**
 * Encode Facebook content
 */
export function encodeFacebook(content: FacebookContent): string {
  return profileUrl(content.profileUrl || "", "https://www.facebook.com/");
}

/**
 * Encode Instagram content
 */
export function encodeInstagram(content: InstagramContent): string {
  const username = handleFrom(content.username || "", "instagram.com");
  if (!username) return "";
  return `https://www.instagram.com/${encodeURIComponent(username)}`;
}

/**
 * Encode Reddit content
 */
export function encodeReddit(content: RedditContent): string {
  const subreddit = handleFrom(content.subreddit || "", "reddit.com", "r/+")
    .replace(/^\/?r\//i, "")
    .replace(/\/+$/, "");
  if (subreddit) {
    return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}`;
  }
  const username = handleFrom(
    content.username || "",
    "reddit.com",
    "(?:u|user)/+",
  )
    .replace(/^\/?(?:u|user)\//i, "")
    .replace(/\/+$/, "");
  if (username) {
    return `https://www.reddit.com/user/${encodeURIComponent(username)}`;
  }
  return "";
}

/**
 * Encode TikTok content
 */
export function encodeTikTok(content: TikTokContent): string {
  const username = handleFrom(content.username || "", "tiktok.com");
  if (!username) return "";
  return `https://www.tiktok.com/@${encodeURIComponent(username)}`;
}

/**
 * Encode Twitter/X content
 */
export function encodeTwitter(content: TwitterContent): string {
  const username = handleFrom(
    handleFrom(content.username || "", "twitter.com"),
    "x.com",
  );
  if (!username) return "";
  return `https://twitter.com/${encodeURIComponent(username)}`;
}

/**
 * Encode LinkedIn content
 */
export function encodeLinkedIn(content: LinkedInContent): string {
  return profileUrl(content.profileUrl || "", "https://www.linkedin.com/in/");
}

/**
 * Encode YouTube content
 */
export function encodeYouTube(content: YouTubeContent): string {
  const url = content.videoUrl?.trim() || content.channelUrl?.trim() || "";
  // A bare "@handle" is a channel.
  if (/^@[\w.-]+$/.test(url)) return `https://www.youtube.com/${url}`;
  return normalizeWebUrl(url);
}

/**
 * Encode Pinterest content
 */
export function encodePinterest(content: PinterestContent): string {
  const username = handleFrom(content.username || "", "pinterest.com");
  if (!username) return "";
  return `https://www.pinterest.com/${encodeURIComponent(username)}`;
}

/**
 * Encode Snapchat content
 */
export function encodeSnapchat(content: SnapchatContent): string {
  const username = handleFrom(content.username || "", "snapchat.com", "add/+");
  if (!username) return "";
  return `https://www.snapchat.com/add/${encodeURIComponent(username)}`;
}

/**
 * Encode Threads content
 */
export function encodeThreads(content: ThreadsContent): string {
  const username = handleFrom(
    handleFrom(content.username || "", "threads.net"),
    "threads.com",
  );
  if (!username) return "";
  return `https://www.threads.net/@${encodeURIComponent(username)}`;
}

/**
 * Encode UPI payment content (NPCI UPI linking spec:
 * upi://pay?pa=&pn=&am=&cu=INR&tn=)
 */
export function encodeUPI(content: UPIContent): string {
  const upiId = content.upiId?.trim();
  if (!upiId) return "";

  const params: string[] = [];
  // Some UPI apps reject a percent-encoded "@" in the VPA.
  params.push(`pa=${encodeURIComponent(upiId).replace(/%40/g, "@")}`);

  if (content.name?.trim()) {
    params.push(`pn=${encodeURIComponent(content.name.trim())}`);
  }
  if (content.amount?.trim()) {
    params.push(`am=${encodeURIComponent(content.amount.trim())}`);
  }
  // Currency is required by the spec; UPI only supports INR.
  params.push("cu=INR");
  if (content.note?.trim()) {
    params.push(`tn=${encodeURIComponent(content.note.trim())}`);
  }

  return `upi://pay?${params.join("&")}`;
}

/**
 * Encode PayPal content
 */
export function encodePayPal(content: PayPalContent): string {
  return profileUrl(content.paypalUrl || "", "https://paypal.me/");
}

/**
 * Encode Plain Text content
 */
export function encodeText(content: TextContent): string {
  return content.text || "";
}

/**
 * Encode Google Review content
 */
export function encodeGoogleReview(content: GoogleReviewContent): string {
  // Accept a pasted review link as well as the bare Place ID.
  const raw = content.placeId?.trim() ?? "";
  const placeId = /[?&]placeid=([^&#]+)/i.exec(raw)?.[1] ?? raw;
  if (!placeId) return "";
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

/**
 * Encode Venmo content
 */
export function encodeVenmo(content: VenmoContent): string {
  const username = handleFrom(content.username || "", "venmo.com", "(?:u/+)?");
  if (!username) return "";

  const params: string[] = [`txn=pay`];

  if (content.amount?.trim()) {
    params.push(`amount=${encodeURIComponent(content.amount.trim())}`);
  }
  if (content.note) {
    params.push(`note=${encodeURIComponent(content.note)}`);
  }

  const queryString = params.length > 0 ? `?${params.join("&")}` : "";
  return `https://venmo.com/${encodeURIComponent(username)}${queryString}`;
}

/**
 * Encode Spotify content: a spotify: URI or an open.spotify.com link
 */
export function encodeSpotify(content: SpotifyContent): string {
  const uri = content.uri?.trim() ?? "";
  if (!uri) return "";

  // If it's already a Spotify URI (spotify:track:xxx), return as is
  if (/^spotify:/i.test(uri)) {
    return uri;
  }

  return normalizeWebUrl(uri);
}

/**
 * Encode Bitcoin content as a BIP-21 URI
 */
export function encodeBitcoin(content: BitcoinContent): string {
  const address = content.address?.trim();
  if (!address) return "";

  const params: string[] = [];
  if (content.amount?.trim()) {
    params.push(`amount=${encodeURIComponent(content.amount.trim())}`);
  }
  if (content.label) {
    params.push(`label=${encodeURIComponent(content.label)}`);
  }
  if (content.message) {
    params.push(`message=${encodeURIComponent(content.message)}`);
  }

  const queryString = params.length > 0 ? `?${params.join("&")}` : "";
  return `bitcoin:${address}${queryString}`;
}

/**
 * Encode Ethereum content as an EIP-681 URI
 */
export function encodeEthereum(content: EthereumContent): string {
  const address = content.address?.trim();
  if (!address) return "";

  const params: string[] = [];
  if (content.amount?.trim()) {
    // EIP-681 amounts are in wei: convert plain decimal ETH, leave exponent forms as given
    const amount = content.amount.trim();
    params.push(
      `value=${/^\d*\.?\d+$/.test(amount) ? `${amount}e18` : encodeURIComponent(amount)}`,
    );
  }
  if (content.gas?.trim()) {
    params.push(`gas=${encodeURIComponent(content.gas.trim())}`);
  }

  const queryString = params.length > 0 ? `?${params.join("&")}` : "";
  return `ethereum:${address}${queryString}`;
}

/**
 * Encode Etsy content
 */
export function encodeEtsy(content: EtsyContent): string {
  return profileUrl(content.shopUrl || "", "https://www.etsy.com/shop/");
}

/**
 * Encode Dub.sh content
 */
export function encodeDubsh(content: DubshContent): string {
  return normalizeWebUrl(content.shortUrl || "");
}

/**
 * Encode Attendance (Google Form) content
 */
export function encodeAttendance(content: AttendanceContent): string {
  return normalizeWebUrl(content.formUrl || "");
}

/**
 * Encode Amazon content
 */
export function encodeAmazon(content: AmazonContent): string {
  return normalizeWebUrl(content.productUrl || "");
}

/**
 * Encode Flipkart content
 */
export function encodeFlipkart(content: FlipkartContent): string {
  return normalizeWebUrl(content.productUrl || "");
}

/**
 * Encode Cal.com content
 */
export function encodeCalcom(content: CalcomContent): string {
  return profileUrl(content.bookingUrl || "", "https://cal.com/");
}

/**
 * Encode Google Drive content
 */
export function encodeGoogleDrive(content: GoogleDriveContent): string {
  return normalizeWebUrl(content.url || "");
}

// ─── Content types added 2026-11-11 ─────────────────────────────────────────
// Messaging, social, meeting, map, payment-link and crypto types. The bank
// payment standards (Pix, SEPA, PayNow, PromptPay, VietQR) live in
// ./payment-qr-codes.ts. Each type has an `…Issue` check, used by its form
// (lib/validations/qr-content.ts) and by validateContent, and an encoder
// that returns "" while the check fails.

/** A problem with one field of a form, or (no field) with the whole content. */
export interface ContentIssue {
  field?: string;
  message: string;
}

const problem = (field: string, message: string): ContentIssue => ({
  field,
  message,
});

/** The text as an http(s) link on one of `hosts` (or below one), else null. */
function linkOn(raw: string, ...hosts: string[]): URL | null {
  const value = raw.trim();
  if (!/[./]/.test(value) || /\s/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(normalizeWebUrl(value));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return hosts.some((item) => host === item || host.endsWith(`.${item}`))
    ? url
    : null;
}

/** A link as an https address. */
function httpsLink(url: URL): string {
  const copy = new URL(url.toString());
  copy.protocol = "https:";
  return copy.toString();
}

/** International numbers only: links like t.me/+… need the country code. */
function internationalPhoneIssue(
  raw: string,
  field: string,
): ContentIssue | null {
  const check = validatePhone(raw);
  if (!check.valid)
    return problem(field, check.error ?? "Invalid phone number");
  if (!normalizePhone(raw).number.startsWith("+")) {
    return problem(field, "Add the country code, starting with +");
  }
  return null;
}

const internationalDigits = (raw: string) =>
  normalizePhone(raw).number.replace(/^\+/, "");

/** "lat, long" within the WGS 84 ranges, else null. */
function coordinates(location: string): [string, string] | null {
  const match = /^([+-]?\d+(?:\.\d+)?),\s*([+-]?\d+(?:\.\d+)?)$/.exec(
    location.trim(),
  );
  if (!match) return null;
  const [lat, long] = [match[1] as string, match[2] as string];
  if (Math.abs(Number(lat)) > 90 || Math.abs(Number(long)) > 180) return null;
  return [lat.replace(/^\+/, ""), long.replace(/^\+/, "")];
}

// Telegram: https://t.me/<username> or https://t.me/+<phone number>

const TELEGRAM_HOSTS = ["t.me", "telegram.me", "telegram.dog"];
/** 5-32 characters: letters, digits and "_", starting with a letter. */
const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,30}[A-Za-z0-9]$/;

export function telegramIssue(
  content: Partial<TelegramContent>,
): ContentIssue | null {
  const username = content.username?.trim() ?? "";
  if (username) {
    if (linkOn(username, ...TELEGRAM_HOSTS)) return null;
    return TELEGRAM_USERNAME.test(username.replace(/^@/, ""))
      ? null
      : problem(
          "username",
          "Telegram usernames are 5-32 letters, digits and underscores, starting with a letter",
        );
  }
  if (content.phoneNumber?.trim()) {
    return internationalPhoneIssue(content.phoneNumber, "phoneNumber");
  }
  return { message: "Telegram username or phone number is required" };
}

export function encodeTelegram(content: TelegramContent): string {
  if (telegramIssue(content)) return "";
  const username = content.username?.trim();
  if (username) {
    const link = linkOn(username, ...TELEGRAM_HOSTS);
    return link
      ? httpsLink(link)
      : `https://t.me/${username.replace(/^@/, "")}`;
  }
  return `https://t.me/+${internationalDigits(content.phoneNumber ?? "")}`;
}

// Signal: https://signal.me/#p/+<number>, or a username or group link

/** A signal.me username or number link, or a signal.group link, else null. */
function signalLink(raw: string): URL | null {
  const url = linkOn(raw, "signal.me", "signal.group");
  if (!url) return null;
  if (url.hostname.endsWith("signal.group"))
    return url.hash.length > 2 ? url : null;
  return /^#(?:eu|p)\/.+/.test(url.hash) ? url : null;
}

export function signalIssue(
  content: Partial<SignalContent>,
): ContentIssue | null {
  if (content.link?.trim()) {
    return signalLink(content.link)
      ? null
      : problem(
          "link",
          "Paste the signal.me username link or signal.group link from the Signal app",
        );
  }
  if (content.phoneNumber?.trim()) {
    return internationalPhoneIssue(content.phoneNumber, "phoneNumber");
  }
  return { message: "Signal phone number or link is required" };
}

export function encodeSignal(content: SignalContent): string {
  if (signalIssue(content)) return "";
  const link = content.link?.trim() ? signalLink(content.link) : null;
  if (link) return httpsLink(link);
  return `https://signal.me/#p/+${internationalDigits(content.phoneNumber ?? "")}`;
}

// Discord: https://discord.gg/<invite code>

const DISCORD_INVITE = /^[A-Za-z0-9-]{2,32}$/;

/** The invite code from a code, discord.gg/<code> or discord.com/invite/<code>. */
function discordInvite(raw: string): string | null {
  const value = raw.trim();
  const url = linkOn(value, "discord.gg", "discord.com", "discordapp.com");
  if (url) {
    const segments = url.pathname.split("/").filter(Boolean);
    const code = url.hostname.endsWith("discord.gg")
      ? segments[0]
      : segments[0] === "invite"
        ? segments[1]
        : undefined;
    return code && DISCORD_INVITE.test(code) ? code : null;
  }
  return DISCORD_INVITE.test(value) ? value : null;
}

export function discordIssue(
  content: Partial<DiscordContent>,
): ContentIssue | null {
  if (!content.invite?.trim()) {
    return problem("invite", "Discord invite link or code is required");
  }
  return discordInvite(content.invite)
    ? null
    : problem(
        "invite",
        "Paste a server invite link (discord.gg/…) or just its code",
      );
}

export function encodeDiscord(content: DiscordContent): string {
  if (discordIssue(content)) return "";
  return `https://discord.gg/${discordInvite(content.invite) as string}`;
}

// LINE: https://line.me/ti/p/~<LINE ID>, or https://line.me/R/ti/p/@<id> for
// an official account

const LINE_ID = /^[A-Za-z0-9._-]{3,20}$/;

export function lineIssue(content: Partial<LineContent>): ContentIssue | null {
  const value = content.username?.trim() ?? "";
  if (!value) return problem("username", "LINE ID is required");
  if (linkOn(value, "line.me", "lin.ee")) return null;
  return LINE_ID.test(value.replace(/^[@~]/, ""))
    ? null
    : problem(
        "username",
        'LINE IDs are letters, digits, ".", "-" and "_". Official accounts start with @.',
      );
}

export function encodeLine(content: LineContent): string {
  if (lineIssue(content)) return "";
  const value = content.username.trim();
  const link = linkOn(value, "line.me", "lin.ee");
  if (link) return httpsLink(link);
  return value.startsWith("@")
    ? `https://line.me/R/ti/p/@${encodeURIComponent(value.slice(1))}`
    : `https://line.me/ti/p/~${encodeURIComponent(value.replace(/^~/, ""))}`;
}

// Bluesky: https://bsky.app/profile/<handle>

const DOMAIN_HANDLE =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** "alice" → "alice.bsky.social"; a domain handle or DID as given. */
function blueskyHandle(raw: string): string | null {
  let value = raw.trim();
  // "bsky.app" alone is Bluesky's own handle; only a path makes it a link.
  const url = value.includes("/") ? linkOn(value, "bsky.app") : null;
  if (url) {
    const match = /^\/profile\/([^/]+)/.exec(url.pathname);
    if (!match) return null;
    value = decodeURIComponent(match[1] as string);
  }
  value = value.replace(/^@/, "");
  if (/^did:(?:plc|web):[A-Za-z0-9._:%-]+$/.test(value)) return value;
  value = value.toLowerCase();
  if (!value.includes(".")) value = `${value}.bsky.social`;
  return value.length <= 253 && DOMAIN_HANDLE.test(value) ? value : null;
}

export function blueskyIssue(
  content: Partial<BlueskyContent>,
): ContentIssue | null {
  if (!content.handle?.trim()) {
    return problem("handle", "Bluesky handle is required");
  }
  return blueskyHandle(content.handle)
    ? null
    : problem(
        "handle",
        "Enter a handle like alice.bsky.social or your own domain",
      );
}

export function encodeBluesky(content: BlueskyContent): string {
  if (blueskyIssue(content)) return "";
  return `https://bsky.app/profile/${blueskyHandle(content.handle) as string}`;
}

// Mastodon and other fediverse servers: https://<server>/@<user>

const FEDIVERSE_USER = /^[A-Za-z0-9_](?:[A-Za-z0-9_.-]{0,62}[A-Za-z0-9_])?$/;

/** "@user@server", "user@server" or "https://server/@user". */
function fediverseProfile(
  raw: string,
): { user: string; server: string } | null {
  const value = raw.trim();
  const handle = /^@?([^@\s/]+)@([^@\s/]+)$/.exec(value);
  if (handle) {
    const [user, server] = [
      handle[1] as string,
      (handle[2] as string).toLowerCase(),
    ];
    return FEDIVERSE_USER.test(user) && DOMAIN_HANDLE.test(server)
      ? { user, server }
      : null;
  }
  if (!value.includes("/")) return null;
  let url: URL;
  try {
    url = new URL(normalizeWebUrl(value));
  } catch {
    return null;
  }
  const path = /^\/@([^/@]+)\/?$/.exec(url.pathname);
  const server = url.hostname.toLowerCase();
  if (!path || !DOMAIN_HANDLE.test(server)) return null;
  const user = decodeURIComponent(path[1] as string);
  return FEDIVERSE_USER.test(user) ? { user, server } : null;
}

export function mastodonIssue(
  content: Partial<MastodonContent>,
): ContentIssue | null {
  if (!content.handle?.trim()) {
    return problem("handle", "Mastodon handle is required");
  }
  return fediverseProfile(content.handle)
    ? null
    : problem(
        "handle",
        "Enter your full handle, like @alice@mastodon.social, or your profile link",
      );
}

export function encodeMastodon(content: MastodonContent): string {
  if (mastodonIssue(content)) return "";
  const { user, server } = fediverseProfile(content.handle) as {
    user: string;
    server: string;
  };
  return `https://${server}/@${user}`;
}

// Twitch: https://www.twitch.tv/<channel>

const TWITCH_NAME = /^[A-Za-z0-9_]{4,25}$/;

export function twitchIssue(
  content: Partial<TwitchContent>,
): ContentIssue | null {
  if (!content.username?.trim()) {
    return problem("username", "Twitch username is required");
  }
  return TWITCH_NAME.test(handleFrom(content.username, "twitch.tv"))
    ? null
    : problem("username", 'Twitch usernames are 4-25 letters, digits and "_"');
}

export function encodeTwitch(content: TwitchContent): string {
  if (twitchIssue(content)) return "";
  return `https://www.twitch.tv/${handleFrom(content.username, "twitch.tv").toLowerCase()}`;
}

// SoundCloud: https://soundcloud.com/<profile>, or a pasted track or playlist

const SOUNDCLOUD_NAME = /^[A-Za-z0-9_-]{3,25}$/;

export function soundCloudIssue(
  content: Partial<SoundCloudContent>,
): ContentIssue | null {
  const value = content.username?.trim() ?? "";
  if (!value) {
    return problem("username", "SoundCloud profile or link is required");
  }
  const link = linkOn(value, "soundcloud.com", "snd.sc");
  if (link) {
    return link.pathname.length > 1
      ? null
      : problem("username", "Paste a profile, track or playlist link");
  }
  return SOUNDCLOUD_NAME.test(value.replace(/^@/, ""))
    ? null
    : problem(
        "username",
        'SoundCloud profile names are 3-25 letters, digits, "_" and "-"',
      );
}

export function encodeSoundCloud(content: SoundCloudContent): string {
  if (soundCloudIssue(content)) return "";
  const value = content.username.trim();
  const link = linkOn(value, "soundcloud.com", "snd.sc");
  return link
    ? httpsLink(link)
    : `https://soundcloud.com/${value.replace(/^@/, "").toLowerCase()}`;
}

// Zoom: https://zoom.us/j/<meeting ID>, or a pasted invite link

const ZOOM_HOSTS = ["zoom.us", "zoom.com", "zoomgov.com"];

function zoomMeetingId(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  return /^\d{9,11}$/.test(digits) ? digits : null;
}

export function zoomIssue(content: Partial<ZoomContent>): ContentIssue | null {
  const value = content.meeting?.trim() ?? "";
  if (!value) return problem("meeting", "Zoom meeting ID or link is required");
  const link = linkOn(value, ...ZOOM_HOSTS);
  if (link) {
    return /^\/(?:j|w|s|my|wc\/join)\/[^/]+/.test(link.pathname)
      ? null
      : problem("meeting", "Paste the meeting's invite link (…zoom.us/j/…)");
  }
  return zoomMeetingId(value)
    ? null
    : problem(
        "meeting",
        "Meeting IDs are 9 to 11 digits. Or paste the invite link to keep its passcode.",
      );
}

export function encodeZoom(content: ZoomContent): string {
  if (zoomIssue(content)) return "";
  const link = linkOn(content.meeting, ...ZOOM_HOSTS);
  return link
    ? httpsLink(link)
    : `https://zoom.us/j/${zoomMeetingId(content.meeting) as string}`;
}

// Google Meet: https://meet.google.com/<abc-defg-hij>

function meetCode(raw: string): string | null {
  let value = raw.trim();
  const link = linkOn(value, "meet.google.com");
  if (link) value = link.pathname.replace(/^\/|\/$/g, "");
  const letters = value.toLowerCase().replace(/[\s-]/g, "");
  return /^[a-z]{10}$/.test(letters)
    ? `${letters.slice(0, 3)}-${letters.slice(3, 7)}-${letters.slice(7)}`
    : null;
}

export function googleMeetIssue(
  content: Partial<GoogleMeetContent>,
): ContentIssue | null {
  if (!content.meeting?.trim()) {
    return problem("meeting", "Google Meet code or link is required");
  }
  return meetCode(content.meeting)
    ? null
    : problem(
        "meeting",
        "Meeting codes look like abc-defg-hij. Paste the code or the meet.google.com link.",
      );
}

export function encodeGoogleMeet(content: GoogleMeetContent): string {
  if (googleMeetIssue(content)) return "";
  return `https://meet.google.com/${meetCode(content.meeting) as string}`;
}

// Waze: https://waze.com/ul?ll=<lat>,<long>&navigate=yes or ?q=<address>

export function wazeIssue(content: Partial<WazeContent>): ContentIssue | null {
  return content.location?.trim()
    ? null
    : problem("location", "Address or coordinates are required");
}

export function encodeWaze(content: WazeContent): string {
  if (wazeIssue(content)) return "";
  const location = content.location.trim();
  const point = coordinates(location);
  const target = point
    ? `ll=${point[0]},${point[1]}`
    : `q=${encodeURIComponent(location)}`;
  return `https://waze.com/ul?${target}${content.navigate === false ? "" : "&navigate=yes"}`;
}

// Cash App: https://cash.app/$<cashtag>

/** 1-20 letters, digits or "_", with at least one letter. */
const CASHTAG = /^(?=[^A-Za-z]*[A-Za-z])[A-Za-z0-9_]{1,20}$/;

const cashtagFrom = (raw: string) =>
  handleFrom(raw, "cash.app", "\\$?").replace(/^\$/, "");

export function cashAppIssue(
  content: Partial<CashAppContent>,
): ContentIssue | null {
  if (!content.username?.trim()) {
    return problem("username", "$Cashtag is required");
  }
  return CASHTAG.test(cashtagFrom(content.username))
    ? null
    : problem(
        "username",
        "A $Cashtag is up to 20 letters and digits, with at least one letter",
      );
}

export function encodeCashApp(content: CashAppContent): string {
  if (cashAppIssue(content)) return "";
  return `https://cash.app/$${cashtagFrom(content.username)}`;
}

// Revolut: https://revolut.me/<username>

const REVTAG = /^[A-Za-z0-9._-]{3,32}$/;

export function revolutIssue(
  content: Partial<RevolutContent>,
): ContentIssue | null {
  if (!content.username?.trim()) {
    return problem("username", "Revolut username is required");
  }
  return REVTAG.test(handleFrom(content.username, "revolut.me"))
    ? null
    : problem(
        "username",
        'Revolut usernames are letters, digits, ".", "-" and "_"',
      );
}

export function encodeRevolut(content: RevolutContent): string {
  if (revolutIssue(content)) return "";
  return `https://revolut.me/${encodeURIComponent(handleFrom(content.username, "revolut.me").toLowerCase())}`;
}

// Crypto payment URIs: one address, an optional amount and descriptions

type CryptoType = "litecoin" | "dogecoin" | "bitcoincash" | "solana" | "monero";

interface CryptoUriSpec {
  name: string;
  scheme: string;
  address: RegExp;
  /** Decimals of the coin's unit */
  decimals: number;
  params: { amount: string; label: string; message: string };
}

const BIP21_PARAMS = { amount: "amount", label: "label", message: "message" };

/** URI schemes: BIP-21 for the Bitcoin forks, Solana Pay, Monero's own. */
export const CRYPTO_URIS: Record<CryptoType, CryptoUriSpec> = {
  litecoin: {
    name: "Litecoin",
    scheme: "litecoin",
    address:
      /^(?:[LM3][a-km-zA-HJ-NP-Z1-9]{25,33}|ltc1[02-9ac-hj-np-z]{8,87})$/,
    decimals: 8,
    params: BIP21_PARAMS,
  },
  dogecoin: {
    name: "Dogecoin",
    scheme: "dogecoin",
    address: /^[DA9][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    decimals: 8,
    params: BIP21_PARAMS,
  },
  bitcoincash: {
    name: "Bitcoin Cash",
    scheme: "bitcoincash",
    address: /^(?:[qp][02-9ac-hj-np-z]{41}|[13][a-km-zA-HJ-NP-Z1-9]{25,33})$/,
    decimals: 8,
    params: BIP21_PARAMS,
  },
  solana: {
    name: "Solana",
    scheme: "solana",
    address: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    decimals: 9,
    params: BIP21_PARAMS,
  },
  monero: {
    name: "Monero",
    scheme: "monero",
    address: /^(?:[48][1-9A-HJ-NP-Za-km-z]{94}|4[1-9A-HJ-NP-Za-km-z]{105})$/,
    decimals: 12,
    params: {
      amount: "tx_amount",
      label: "recipient_name",
      message: "tx_description",
    },
  },
};

type CryptoContent = Extract<QRContentConfig, { type: CryptoType }>;

/** The address without a pasted "bitcoincash:" (or other) prefix. */
const cryptoAddress = (type: CryptoType, raw: string) =>
  raw.trim().replace(new RegExp(`^${CRYPTO_URIS[type].scheme}:`, "i"), "");

export function cryptoIssue(
  content: Partial<CryptoContent> & { type: CryptoType },
): ContentIssue | null {
  const spec = CRYPTO_URIS[content.type];
  if (!content.address?.trim()) {
    return problem("address", `${spec.name} address is required`);
  }
  if (!spec.address.test(cryptoAddress(content.type, content.address))) {
    return problem("address", `Enter a valid ${spec.name} address`);
  }
  const amount = validateAmount(content.amount, spec.decimals, "Amount");
  return amount.valid
    ? null
    : problem("amount", amount.error ?? "Invalid amount");
}

export function encodeCrypto(content: CryptoContent): string {
  if (cryptoIssue(content)) return "";
  const spec = CRYPTO_URIS[content.type];
  const params: string[] = [];
  if (content.amount?.trim()) {
    params.push(`${spec.params.amount}=${content.amount.trim()}`);
  }
  if (content.label?.trim()) {
    params.push(
      `${spec.params.label}=${encodeURIComponent(content.label.trim())}`,
    );
  }
  if (content.message?.trim()) {
    params.push(
      `${spec.params.message}=${encodeURIComponent(content.message.trim())}`,
    );
  }
  const query = params.length > 0 ? `?${params.join("&")}` : "";
  return `${spec.scheme}:${cryptoAddress(content.type, content.address)}${query}`;
}

/** The checks above as validateContent results. */
const fromIssue = (found: ContentIssue | null): Validation =>
  found ? { valid: false, error: found.message } : { valid: true };

// ─── end of the 2026-11-11 types ────────────────────────────────────────────

/**
 * Main encoder function that handles all content types
 */
export function encodeQRContent(content: QRContentConfig | null): string {
  if (!content) return "";

  switch (content.type) {
    case "url":
      return encodeUrl(content);
    case "text":
      return encodeText(content);
    case "email":
      return encodeEmail(content);
    case "phone":
      return encodePhone(content);
    case "sms":
      return encodeSms(content);
    case "whatsapp":
      return encodeWhatsApp(content);
    case "wifi":
      return encodeWifi(content);
    case "vcard":
      return encodeVCard(content);
    case "maps":
      return encodeMaps(content);
    case "facebook":
      return encodeFacebook(content);
    case "instagram":
      return encodeInstagram(content);
    case "reddit":
      return encodeReddit(content);
    case "tiktok":
      return encodeTikTok(content);
    case "twitter":
      return encodeTwitter(content);
    case "linkedin":
      return encodeLinkedIn(content);
    case "youtube":
      return encodeYouTube(content);
    case "pinterest":
      return encodePinterest(content);
    case "snapchat":
      return encodeSnapchat(content);
    case "threads":
      return encodeThreads(content);
    case "upi":
      return encodeUPI(content);
    case "paypal":
      return encodePayPal(content);
    case "google-review":
      return encodeGoogleReview(content);
    case "venmo":
      return encodeVenmo(content);
    case "spotify":
      return encodeSpotify(content);
    case "bitcoin":
      return encodeBitcoin(content);
    case "ethereum":
      return encodeEthereum(content);
    case "etsy":
      return encodeEtsy(content);
    case "dubsh":
      return encodeDubsh(content);
    case "attendance":
      return encodeAttendance(content);
    case "amazon":
      return encodeAmazon(content);
    case "flipkart":
      return encodeFlipkart(content);
    case "calcom":
      return encodeCalcom(content);
    case "google-drive":
      return encodeGoogleDrive(content);
    // Added 2026-11-11
    case "pix":
      return encodePix(content);
    case "sepa":
      return encodeSepa(content);
    case "paynow":
      return encodePayNow(content);
    case "promptpay":
      return encodePromptPay(content);
    case "vietqr":
      return encodeVietQr(content);
    case "cashapp":
      return encodeCashApp(content);
    case "revolut":
      return encodeRevolut(content);
    case "telegram":
      return encodeTelegram(content);
    case "signal":
      return encodeSignal(content);
    case "discord":
      return encodeDiscord(content);
    case "line":
      return encodeLine(content);
    case "bluesky":
      return encodeBluesky(content);
    case "mastodon":
      return encodeMastodon(content);
    case "twitch":
      return encodeTwitch(content);
    case "soundcloud":
      return encodeSoundCloud(content);
    case "zoom":
      return encodeZoom(content);
    case "google-meet":
      return encodeGoogleMeet(content);
    case "waze":
      return encodeWaze(content);
    case "litecoin":
    case "dogecoin":
    case "bitcoincash":
    case "solana":
    case "monero":
      return encodeCrypto(content);
    default:
      return "";
  }
}

type Validation = { valid: boolean; error?: string };

/** E.164 allows at most 15 digits; anything under 3 can't be dialed. */
function validatePhone(raw: string | undefined): Validation {
  if (!raw || raw.trim() === "") {
    return { valid: false, error: "Phone number is required" };
  }
  const digits = normalizePhone(raw).number.replace(/\D/g, "").length;
  if (digits < 3 || digits > 15) {
    return { valid: false, error: "Enter a valid phone number (3-15 digits)" };
  }
  return { valid: true };
}

/** Usernames are letters, digits, "_", "." and "-" on every network. */
function validateHandle(handle: string, network: string): Validation {
  return /^[\w.-]+$/.test(handle)
    ? { valid: true }
    : {
        valid: false,
        error: `${network} usernames can only use letters, numbers, "_", "." and "-"`,
      };
}

/** A non-negative decimal with at most `decimals` places, or empty. */
function validateAmount(
  raw: string | undefined,
  decimals: number,
  label: string,
): Validation {
  const amount = raw?.trim();
  if (!amount) return { valid: true };
  if (
    !new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(amount) ||
    Number(amount) === 0
  ) {
    return {
      valid: false,
      error: `${label} must be a positive number with up to ${decimals} decimals`,
    };
  }
  return { valid: true };
}

/**
 * Validate content before encoding: required fields, field formats, and
 * that the encoded payload fits in a QR code
 */
export function validateContent(content: QRContentConfig): Validation {
  const fields = validateFields(content);
  if (!fields.valid) return fields;
  const bytes = utf8.encode(encodeQRContent(content)).length;
  if (bytes > MAX_QR_PAYLOAD_BYTES) {
    return {
      valid: false,
      error: `Content is too long for a QR code (${bytes} bytes, the maximum is ${MAX_QR_PAYLOAD_BYTES})`,
    };
  }
  return fields;
}

function validateFields(content: QRContentConfig): Validation {
  switch (content.type) {
    case "url":
      if (!content.url || content.url.trim() === "") {
        return { valid: false, error: "URL is required" };
      }
      return { valid: true };

    case "text":
      if (!content.text || content.text.trim() === "") {
        return { valid: false, error: "Text is required" };
      }
      return { valid: true };

    case "email":
      if (!content.recipient || content.recipient.trim() === "") {
        return { valid: false, error: "Recipient email is required" };
      }
      // Basic email validation (one or more comma-separated addresses)
      if (
        !content.recipient
          .split(",")
          .every((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim()))
      ) {
        return { valid: false, error: "Invalid email format" };
      }
      return { valid: true };

    case "phone":
    case "sms":
    case "whatsapp":
      return validatePhone(content.phoneNumber);

    case "wifi": {
      if (!content.ssid || content.ssid.trim() === "") {
        return { valid: false, error: "WiFi SSID is required" };
      }
      // IEEE 802.11: an SSID is at most 32 bytes.
      if (utf8.encode(content.ssid).length > 32) {
        return { valid: false, error: "Network names are at most 32 bytes" };
      }
      const password = content.password ?? "";
      if (content.encryption !== "nopass" && !password) {
        return {
          valid: false,
          error: "Password is required for secured networks",
        };
      }
      // WPA/WPA2 passphrases are 8-63 characters, or a 64-digit hex key.
      if (
        content.encryption === "WPA" &&
        (password.length < 8 || password.length > 63) &&
        !/^[0-9a-f]{64}$/i.test(password)
      ) {
        return {
          valid: false,
          error: "WPA passwords are 8-63 characters long",
        };
      }
      return { valid: true };
    }

    case "vcard":
      if (!content.firstName || content.firstName.trim() === "") {
        return { valid: false, error: "First name is required" };
      }
      return { valid: true };

    case "maps":
      if (!content.location || content.location.trim() === "") {
        return { valid: false, error: "Location is required" };
      }
      return { valid: true };

    case "facebook":
      if (!content.profileUrl || content.profileUrl.trim() === "") {
        return { valid: false, error: "Facebook profile URL is required" };
      }
      return { valid: true };

    case "instagram":
      if (!content.username || content.username.trim() === "") {
        return { valid: false, error: "Instagram username is required" };
      }
      return validateHandle(
        handleFrom(content.username, "instagram.com"),
        "Instagram",
      );

    case "reddit":
      if (!content.username && !content.subreddit) {
        return {
          valid: false,
          error: "Reddit username or subreddit is required",
        };
      }
      return { valid: true };

    case "tiktok":
      if (!content.username || content.username.trim() === "") {
        return { valid: false, error: "TikTok username is required" };
      }
      return validateHandle(
        handleFrom(content.username, "tiktok.com"),
        "TikTok",
      );

    case "twitter":
      if (!content.username || content.username.trim() === "") {
        return { valid: false, error: "Twitter username is required" };
      }
      return validateHandle(
        handleFrom(handleFrom(content.username, "twitter.com"), "x.com"),
        "Twitter",
      );

    case "linkedin":
      if (!content.profileUrl || content.profileUrl.trim() === "") {
        return { valid: false, error: "LinkedIn profile URL is required" };
      }
      return { valid: true };

    case "youtube":
      if (!content.channelUrl && !content.videoUrl) {
        return {
          valid: false,
          error: "YouTube channel or video URL is required",
        };
      }
      return { valid: true };

    case "pinterest":
      if (!content.username || content.username.trim() === "") {
        return { valid: false, error: "Pinterest username is required" };
      }
      return validateHandle(
        handleFrom(content.username, "pinterest.com"),
        "Pinterest",
      );

    case "snapchat":
      if (!content.username || content.username.trim() === "") {
        return { valid: false, error: "Snapchat username is required" };
      }
      return validateHandle(
        handleFrom(content.username, "snapchat.com", "add/+"),
        "Snapchat",
      );

    case "threads":
      if (!content.username || content.username.trim() === "") {
        return { valid: false, error: "Threads username is required" };
      }
      return validateHandle(
        handleFrom(handleFrom(content.username, "threads.net"), "threads.com"),
        "Threads",
      );

    case "upi":
      if (!content.upiId || content.upiId.trim() === "") {
        return { valid: false, error: "UPI ID is required" };
      }
      // Basic UPI ID validation (user@bank format)
      if (!/^[\w.-]+@[\w.-]+$/.test(content.upiId.trim())) {
        return { valid: false, error: "Invalid UPI ID format" };
      }
      // NPCI: amounts are rupees with up to 2 decimals.
      return validateAmount(content.amount, 2, "Amount");

    case "paypal":
      if (!content.paypalUrl || content.paypalUrl.trim() === "") {
        return { valid: false, error: "PayPal URL is required" };
      }
      return { valid: true };

    case "google-review":
      if (!content.placeId || content.placeId.trim() === "") {
        return { valid: false, error: "Place ID is required" };
      }
      return { valid: true };

    case "venmo":
      if (!content.username || content.username.trim() === "") {
        return { valid: false, error: "Venmo username is required" };
      }
      return { valid: true };

    case "spotify":
      if (!content.uri || content.uri.trim() === "") {
        return { valid: false, error: "Spotify URI or URL is required" };
      }
      return { valid: true };

    case "bitcoin":
      if (!content.address || content.address.trim() === "") {
        return { valid: false, error: "Bitcoin address is required" };
      }
      if (
        content.address.trim().length < 26 ||
        content.address.trim().length > 62
      ) {
        return { valid: false, error: "Invalid Bitcoin address length" };
      }
      // BIP-21: decimal BTC, "." separator, at most 8 decimals (satoshis).
      return validateAmount(content.amount, 8, "Amount");

    case "ethereum":
      if (!content.address || content.address.trim() === "") {
        return { valid: false, error: "Ethereum address is required" };
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(content.address.trim())) {
        return { valid: false, error: "Invalid Ethereum address format" };
      }
      // Wei in EIP-681 scientific notation ("1.5e18") is passed through.
      if (/^\d+(\.\d+)?e\d+$/i.test(content.amount?.trim() ?? "")) {
        return { valid: true };
      }
      // Decimal ETH converts to whole wei: at most 18 decimals.
      return validateAmount(content.amount, 18, "Amount");

    case "etsy":
      if (!content.shopUrl || content.shopUrl.trim() === "") {
        return { valid: false, error: "Etsy shop URL is required" };
      }
      return { valid: true };

    case "dubsh":
      if (!content.shortUrl || content.shortUrl.trim() === "") {
        return { valid: false, error: "Short URL is required" };
      }
      return { valid: true };

    case "attendance":
      if (!content.formUrl || content.formUrl.trim() === "") {
        return { valid: false, error: "Google Form URL is required" };
      }
      return { valid: true };

    case "amazon":
      if (!content.productUrl || content.productUrl.trim() === "") {
        return { valid: false, error: "Amazon product URL is required" };
      }
      return { valid: true };

    case "flipkart":
      if (!content.productUrl || content.productUrl.trim() === "") {
        return { valid: false, error: "Flipkart product URL is required" };
      }
      return { valid: true };

    case "calcom":
      if (!content.bookingUrl || content.bookingUrl.trim() === "") {
        return { valid: false, error: "Cal.com booking URL is required" };
      }
      return { valid: true };

    case "google-drive":
      if (!content.url || content.url.trim() === "") {
        return { valid: false, error: "Google Drive URL is required" };
      }
      return { valid: true };

    // Added 2026-11-11
    case "pix":
      return fromIssue(pixIssue(content));
    case "sepa":
      return fromIssue(sepaIssue(content));
    case "paynow":
      return fromIssue(payNowIssue(content));
    case "promptpay":
      return fromIssue(promptPayIssue(content));
    case "vietqr":
      return fromIssue(vietQrIssue(content));
    case "cashapp":
      return fromIssue(cashAppIssue(content));
    case "revolut":
      return fromIssue(revolutIssue(content));
    case "telegram":
      return fromIssue(telegramIssue(content));
    case "signal":
      return fromIssue(signalIssue(content));
    case "discord":
      return fromIssue(discordIssue(content));
    case "line":
      return fromIssue(lineIssue(content));
    case "bluesky":
      return fromIssue(blueskyIssue(content));
    case "mastodon":
      return fromIssue(mastodonIssue(content));
    case "twitch":
      return fromIssue(twitchIssue(content));
    case "soundcloud":
      return fromIssue(soundCloudIssue(content));
    case "zoom":
      return fromIssue(zoomIssue(content));
    case "google-meet":
      return fromIssue(googleMeetIssue(content));
    case "waze":
      return fromIssue(wazeIssue(content));
    case "litecoin":
    case "dogecoin":
    case "bitcoincash":
    case "solana":
    case "monero":
      return fromIssue(cryptoIssue(content));

    default:
      return { valid: false, error: "Unknown content type" };
  }
}
