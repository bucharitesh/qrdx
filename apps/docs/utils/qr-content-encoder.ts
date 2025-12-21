/**
 * QR Content Encoder Utilities
 * Encodes various content types into QR-compatible string formats
 */

import type {
  AmazonContent,
  AttendanceContent,
  BitcoinContent,
  CalcomContent,
  DubshContent,
  EmailContent,
  EthereumContent,
  EtsyContent,
  FacebookContent,
  FlipkartContent,
  GoogleReviewContent,
  InstagramContent,
  LinkedInContent,
  MapsContent,
  PayPalContent,
  PhoneContent,
  PinterestContent,
  QRContentConfig,
  RedditContent,
  SmsContent,
  SnapchatContent,
  SpotifyContent,
  TextContent,
  ThreadsContent,
  TikTokContent,
  TwitterContent,
  UPIContent,
  UrlContent,
  VCardContent,
  VenmoContent,
  WhatsAppContent,
  WifiContent,
  YouTubeContent,
} from "@/types/qr-content";

/**
 * Encode URL/Plain Text content
 */
export function encodeUrl(content: UrlContent): string {
  return content.url || "";
}

/**
 * Encode Email content into mailto: format
 */
export function encodeEmail(content: EmailContent): string {
  if (!content.recipient) return "";

  const params: string[] = [];
  if (content.subject) {
    params.push(`subject=${encodeURIComponent(content.subject)}`);
  }
  if (content.body) {
    params.push(`body=${encodeURIComponent(content.body)}`);
  }

  const queryString = params.length > 0 ? `?${params.join("&")}` : "";
  return `mailto:${content.recipient}${queryString}`;
}

/**
 * Encode Phone content into tel: format
 */
export function encodePhone(content: PhoneContent): string {
  if (!content.phoneNumber) return "";
  // Remove non-numeric characters except + for international format
  const cleanNumber = content.phoneNumber.replace(/[^\d+]/g, "");
  return `tel:${cleanNumber}`;
}

/**
 * Encode SMS content
 */
export function encodeSms(content: SmsContent): string {
  if (!content.phoneNumber) return "";
  const cleanNumber = content.phoneNumber.replace(/[^\d+]/g, "");

  // Different formats for iOS and Android compatibility
  if (content.message) {
    // SMSTO format is more widely supported
    return `SMSTO:${cleanNumber}:${content.message}`;
  }
  return `sms:${cleanNumber}`;
}

/**
 * Encode WhatsApp content
 */
export function encodeWhatsApp(content: WhatsAppContent): string {
  if (!content.phoneNumber) return "";
  // Remove non-numeric characters except +
  const cleanNumber = content.phoneNumber.replace(/[^\d+]/g, "");
  // Remove + if present as WhatsApp API doesn't use it
  const numberWithoutPlus = cleanNumber.replace(/^\+/, "");

  if (content.message) {
    return `https://wa.me/${numberWithoutPlus}?text=${encodeURIComponent(content.message)}`;
  }
  return `https://wa.me/${numberWithoutPlus}`;
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
    return `WIFI:T:nopass;S:${escapedSsid};;`;
  }

  return `WIFI:T:${encryption};S:${escapedSsid};P:${escapedPassword};H:${hidden};`;
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

/**
 * Encode vCard content into VCARD 3.0 format
 */
export function encodeVCard(content: VCardContent): string {
  if (!content.firstName) return "";

  const lines: string[] = [];
  lines.push("BEGIN:VCARD");
  lines.push("VERSION:3.0");

  // Name (required)
  const fullName = [content.firstName, content.lastName]
    .filter(Boolean)
    .join(" ");
  lines.push(`FN:${fullName}`);
  lines.push(`N:${content.lastName || ""};${content.firstName};;;`);

  // Organization
  if (content.organization) {
    lines.push(`ORG:${content.organization}`);
  }

  // Phone
  if (content.phone) {
    lines.push(`TEL;TYPE=CELL:${content.phone}`);
  }

  // Email
  if (content.email) {
    lines.push(`EMAIL:${content.email}`);
  }

  // URL
  if (content.url) {
    lines.push(`URL:${content.url}`);
  }

  // Address
  if (content.address) {
    lines.push(`ADR:;;${content.address};;;;`);
  }

  // Note
  if (content.note) {
    lines.push(`NOTE:${content.note}`);
  }

  lines.push("END:VCARD");

  return lines.join("\n");
}

/**
 * Encode Maps content into Google Maps URL
 */
export function encodeMaps(content: MapsContent): string {
  if (!content.location) return "";

  // Check if it's coordinates (lat,long format)
  const coordsRegex = /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/;
  if (coordsRegex.test(content.location.trim())) {
    const coords = content.location.trim();
    return `https://www.google.com/maps?q=${coords}`;
  }

  // Otherwise treat as address
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(content.location)}`;
}

/**
 * Encode Facebook content
 */
export function encodeFacebook(content: FacebookContent): string {
  if (!content.profileUrl) return "";
  return content.profileUrl;
}

/**
 * Encode Instagram content
 */
export function encodeInstagram(content: InstagramContent): string {
  if (!content.username) return "";
  const cleanUsername = content.username.replace(/^@/, "");
  return `https://www.instagram.com/${cleanUsername}`;
}

/**
 * Encode Reddit content
 */
export function encodeReddit(content: RedditContent): string {
  if (content.subreddit) {
    const cleanSubreddit = content.subreddit.replace(/^r\//, "");
    return `https://www.reddit.com/r/${cleanSubreddit}`;
  }
  if (content.username) {
    const cleanUsername = content.username.replace(/^u\//, "");
    return `https://www.reddit.com/user/${cleanUsername}`;
  }
  return "";
}

/**
 * Encode TikTok content
 */
export function encodeTikTok(content: TikTokContent): string {
  if (!content.username) return "";
  const cleanUsername = content.username.replace(/^@/, "");
  return `https://www.tiktok.com/@${cleanUsername}`;
}

/**
 * Encode Twitter/X content
 */
export function encodeTwitter(content: TwitterContent): string {
  if (!content.username) return "";
  const cleanUsername = content.username.replace(/^@/, "");
  return `https://twitter.com/${cleanUsername}`;
}

/**
 * Encode LinkedIn content
 */
export function encodeLinkedIn(content: LinkedInContent): string {
  if (!content.profileUrl) return "";
  return content.profileUrl;
}

/**
 * Encode YouTube content
 */
export function encodeYouTube(content: YouTubeContent): string {
  if (content.videoUrl) return content.videoUrl;
  if (content.channelUrl) return content.channelUrl;
  return "";
}

/**
 * Encode Pinterest content
 */
export function encodePinterest(content: PinterestContent): string {
  if (!content.username) return "";
  const cleanUsername = content.username.replace(/^@/, "");
  return `https://www.pinterest.com/${cleanUsername}`;
}

/**
 * Encode Snapchat content
 */
export function encodeSnapchat(content: SnapchatContent): string {
  if (!content.username) return "";
  const cleanUsername = content.username.replace(/^@/, "");
  return `https://www.snapchat.com/add/${cleanUsername}`;
}

/**
 * Encode Threads content
 */
export function encodeThreads(content: ThreadsContent): string {
  if (!content.username) return "";
  const cleanUsername = content.username.replace(/^@/, "");
  return `https://www.threads.net/@${cleanUsername}`;
}

/**
 * Encode UPI payment content
 */
export function encodeUPI(content: UPIContent): string {
  if (!content.upiId) return "";

  const params: string[] = [];
  params.push(`pa=${encodeURIComponent(content.upiId)}`);

  if (content.name) {
    params.push(`pn=${encodeURIComponent(content.name)}`);
  }
  if (content.amount) {
    params.push(`am=${encodeURIComponent(content.amount)}`);
  }
  if (content.note) {
    params.push(`tn=${encodeURIComponent(content.note)}`);
  }

  return `upi://pay?${params.join("&")}`;
}

/**
 * Encode PayPal content
 */
export function encodePayPal(content: PayPalContent): string {
  if (!content.paypalUrl) return "";
  return content.paypalUrl;
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
  if (!content.placeId) return "";
  return `https://search.google.com/local/writereview?placeid=${content.placeId}`;
}

/**
 * Encode Venmo content
 */
export function encodeVenmo(content: VenmoContent): string {
  if (!content.username) return "";
  const cleanUsername = content.username.replace(/^@/, "");

  const params: string[] = [`txn=pay`];

  if (content.amount) {
    params.push(`amount=${encodeURIComponent(content.amount)}`);
  }
  if (content.note) {
    params.push(`note=${encodeURIComponent(content.note)}`);
  }

  const queryString = params.length > 0 ? `?${params.join("&")}` : "";
  return `https://venmo.com/${cleanUsername}${queryString}`;
}

/**
 * Encode Spotify content
 */
export function encodeSpotify(content: SpotifyContent): string {
  if (!content.uri) return "";

  // If it's already a Spotify URI (spotify:track:xxx), return as is
  if (content.uri.startsWith("spotify:")) {
    return content.uri;
  }

  // If it's a Spotify URL, return as is
  if (content.uri.includes("spotify.com")) {
    return content.uri;
  }

  return content.uri;
}

/**
 * Encode Bitcoin content
 */
export function encodeBitcoin(content: BitcoinContent): string {
  if (!content.address) return "";

  const params: string[] = [];
  if (content.amount) {
    params.push(`amount=${content.amount}`);
  }
  if (content.label) {
    params.push(`label=${encodeURIComponent(content.label)}`);
  }
  if (content.message) {
    params.push(`message=${encodeURIComponent(content.message)}`);
  }

  const queryString = params.length > 0 ? `?${params.join("&")}` : "";
  return `bitcoin:${content.address}${queryString}`;
}

/**
 * Encode Ethereum content
 */
export function encodeEthereum(content: EthereumContent): string {
  if (!content.address) return "";

  const params: string[] = [];
  if (content.amount) {
    params.push(`value=${content.amount}`);
  }
  if (content.gas) {
    params.push(`gas=${content.gas}`);
  }

  const queryString = params.length > 0 ? `?${params.join("&")}` : "";
  return `ethereum:${content.address}${queryString}`;
}

/**
 * Encode Etsy content
 */
export function encodeEtsy(content: EtsyContent): string {
  if (!content.shopUrl) return "";
  return content.shopUrl;
}

/**
 * Encode Dub.sh content
 */
export function encodeDubsh(content: DubshContent): string {
  if (!content.shortUrl) return "";
  return content.shortUrl;
}

/**
 * Encode Attendance (Google Form) content
 */
export function encodeAttendance(content: AttendanceContent): string {
  if (!content.formUrl) return "";
  return content.formUrl;
}

/**
 * Encode Amazon content
 */
export function encodeAmazon(content: AmazonContent): string {
  if (!content.productUrl) return "";
  return content.productUrl;
}

/**
 * Encode Flipkart content
 */
export function encodeFlipkart(content: FlipkartContent): string {
  if (!content.productUrl) return "";
  return content.productUrl;
}

/**
 * Encode Cal.com content
 */
export function encodeCalcom(content: CalcomContent): string {
  if (!content.bookingUrl) return "";
  return content.bookingUrl;
}

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
    default:
      return "";
  }
}

/**
 * Validate content before encoding
 */
export function validateContent(content: QRContentConfig): {
  valid: boolean;
  error?: string;
} {
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
      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.recipient)) {
        return { valid: false, error: "Invalid email format" };
      }
      return { valid: true };

    case "phone":
      if (!content.phoneNumber || content.phoneNumber.trim() === "") {
        return { valid: false, error: "Phone number is required" };
      }
      return { valid: true };

    case "sms":
      if (!content.phoneNumber || content.phoneNumber.trim() === "") {
        return { valid: false, error: "Phone number is required" };
      }
      return { valid: true };

    case "whatsapp":
      if (!content.phoneNumber || content.phoneNumber.trim() === "") {
        return { valid: false, error: "Phone number is required" };
      }
      return { valid: true };

    case "wifi":
      if (!content.ssid || content.ssid.trim() === "") {
        return { valid: false, error: "WiFi SSID is required" };
      }
      if (content.encryption !== "nopass" && !content.password) {
        return {
          valid: false,
          error: "Password is required for secured networks",
        };
      }
      return { valid: true };

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
      return { valid: true };

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
      return { valid: true };

    case "twitter":
      if (!content.username || content.username.trim() === "") {
        return { valid: false, error: "Twitter username is required" };
      }
      return { valid: true };

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
      return { valid: true };

    case "snapchat":
      if (!content.username || content.username.trim() === "") {
        return { valid: false, error: "Snapchat username is required" };
      }
      return { valid: true };

    case "threads":
      if (!content.username || content.username.trim() === "") {
        return { valid: false, error: "Threads username is required" };
      }
      return { valid: true };

    case "upi":
      if (!content.upiId || content.upiId.trim() === "") {
        return { valid: false, error: "UPI ID is required" };
      }
      // Basic UPI ID validation (user@bank format)
      if (!/^[\w.-]+@[\w.-]+$/.test(content.upiId)) {
        return { valid: false, error: "Invalid UPI ID format" };
      }
      return { valid: true };

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
      if (content.address.length < 26 || content.address.length > 62) {
        return { valid: false, error: "Invalid Bitcoin address length" };
      }
      return { valid: true };

    case "ethereum":
      if (!content.address || content.address.trim() === "") {
        return { valid: false, error: "Ethereum address is required" };
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(content.address)) {
        return { valid: false, error: "Invalid Ethereum address format" };
      }
      return { valid: true };

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

    default:
      return { valid: false, error: "Unknown content type" };
  }
}
