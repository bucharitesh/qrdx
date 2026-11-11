/**
 * QR Code Content Types
 * Defines all supported content types and their configurations
 */

export type ContentType =
  | "url"
  | "text"
  | "email"
  | "phone"
  | "sms"
  | "whatsapp"
  | "wifi"
  | "vcard"
  | "maps"
  | "facebook"
  | "instagram"
  | "reddit"
  | "tiktok"
  | "twitter"
  | "linkedin"
  | "youtube"
  | "pinterest"
  | "snapchat"
  | "threads"
  | "upi"
  | "paypal"
  | "google-review"
  | "venmo"
  | "spotify"
  | "bitcoin"
  | "ethereum"
  | "etsy"
  | "dubsh"
  | "attendance"
  | "amazon"
  | "flipkart"
  | "calcom"
  | "google-drive"
  // Added 2026-11-11 (payments, messaging, social, meetings, maps, crypto)
  | "pix"
  | "sepa"
  | "paynow"
  | "promptpay"
  | "vietqr"
  | "cashapp"
  | "revolut"
  | "telegram"
  | "signal"
  | "discord"
  | "line"
  | "bluesky"
  | "mastodon"
  | "twitch"
  | "soundcloud"
  | "zoom"
  | "google-meet"
  | "waze"
  | "litecoin"
  | "dogecoin"
  | "bitcoincash"
  | "solana"
  | "monero";

/**
 * URL/Plain Text Content
 */
export interface UrlContent {
  type: "url";
  url: string;
}

/**
 * Email Content
 */
export interface EmailContent {
  type: "email";
  recipient: string;
  subject?: string;
  body?: string;
}

/**
 * Phone Call Content
 */
export interface PhoneContent {
  type: "phone";
  phoneNumber: string;
}

/**
 * SMS Content
 */
export interface SmsContent {
  type: "sms";
  phoneNumber: string;
  message?: string;
}

/**
 * WhatsApp Content
 */
export interface WhatsAppContent {
  type: "whatsapp";
  phoneNumber: string;
  message?: string;
}

/**
 * WiFi Network Content
 */
export interface WifiContent {
  type: "wifi";
  ssid: string;
  password: string;
  encryption: "WPA" | "WEP" | "nopass";
  hidden?: boolean;
}

/**
 * vCard Contact Content
 */
export interface VCardContent {
  type: "vcard";
  firstName: string;
  lastName?: string;
  organization?: string;
  phone?: string;
  email?: string;
  url?: string;
  address?: string;
  note?: string;
}

/**
 * Google Maps Location Content
 */
export interface MapsContent {
  type: "maps";
  location: string; // Can be address or lat,long
}

/**
 * Facebook Content
 */
export interface FacebookContent {
  type: "facebook";
  profileUrl: string;
}

/**
 * Instagram Content
 */
export interface InstagramContent {
  type: "instagram";
  username: string;
}

/**
 * Reddit Content
 */
export interface RedditContent {
  type: "reddit";
  username?: string;
  subreddit?: string;
}

/**
 * TikTok Content
 */
export interface TikTokContent {
  type: "tiktok";
  username: string;
}

/**
 * Twitter/X Content
 */
export interface TwitterContent {
  type: "twitter";
  username: string;
}

/**
 * LinkedIn Content
 */
export interface LinkedInContent {
  type: "linkedin";
  profileUrl: string;
}

/**
 * YouTube Content
 */
export interface YouTubeContent {
  type: "youtube";
  channelUrl?: string;
  videoUrl?: string;
}

/**
 * Pinterest Content
 */
export interface PinterestContent {
  type: "pinterest";
  username: string;
}

/**
 * Snapchat Content
 */
export interface SnapchatContent {
  type: "snapchat";
  username: string;
}

/**
 * Threads Content
 */
export interface ThreadsContent {
  type: "threads";
  username: string;
}

/**
 * UPI Payment Content (India)
 */
export interface UPIContent {
  type: "upi";
  upiId: string;
  name?: string;
  amount?: string;
  note?: string;
}

/**
 * PayPal Content
 */
export interface PayPalContent {
  type: "paypal";
  paypalUrl: string;
}

/**
 * Plain Text Content (separate from URL)
 */
export interface TextContent {
  type: "text";
  text: string;
}

/**
 * Google Review Content
 */
export interface GoogleReviewContent {
  type: "google-review";
  placeId: string;
}

/**
 * Venmo Content
 */
export interface VenmoContent {
  type: "venmo";
  username: string;
  amount?: string;
  note?: string;
}

/**
 * Spotify Content
 */
export interface SpotifyContent {
  type: "spotify";
  uri: string; // Can be artist, album, playlist, or track URI
}

/**
 * Bitcoin Payment Content
 */
export interface BitcoinContent {
  type: "bitcoin";
  address: string;
  amount?: string;
  label?: string;
  message?: string;
}

/**
 * Ethereum Payment Content
 */
export interface EthereumContent {
  type: "ethereum";
  address: string;
  amount?: string;
  gas?: string;
}

/**
 * Etsy Content
 */
export interface EtsyContent {
  type: "etsy";
  shopUrl: string;
}

/**
 * Dub.sh Content
 */
export interface DubshContent {
  type: "dubsh";
  shortUrl: string;
  source?: "manual" | "dub-selected" | "dub-created";
  dubLinkId?: string;
  domain?: string;
  key?: string;
  destinationUrl?: string;
  qrCodeUrl?: string;
}

/**
 * Google Drive Content
 */
export interface GoogleDriveContent {
  type: "google-drive";
  url: string;
  name?: string;
  fileId?: string;
  mimeType?: string;
  source?: "manual" | "drive-selected";
}

/**
 * Attendance Content (Google Form)
 */
export interface AttendanceContent {
  type: "attendance";
  formUrl: string;
}

/**
 * Amazon Content
 */
export interface AmazonContent {
  type: "amazon";
  productUrl: string;
}

/**
 * Flipkart Content
 */
export interface FlipkartContent {
  type: "flipkart";
  productUrl: string;
}

/**
 * Cal.com Calendar Content
 */
export interface CalcomContent {
  type: "calcom";
  bookingUrl: string;
}

// ─── Content types added 2026-11-11 ─────────────────────────────────────────

/** Pix (Brazil): a static BR Code, EMV merchant-presented. */
export interface PixContent {
  type: "pix";
  /** CPF, CNPJ, +55 phone, email or random (EVP) key */
  pixKey: string;
  /** Receiver name, up to 25 characters */
  name: string;
  /** Receiver city, up to 15 characters */
  city: string;
  amount?: string;
  /** Transaction ID, up to 25 letters and digits ("***" when empty) */
  txid?: string;
  message?: string;
}

/** SEPA credit transfer (EPC069-12). */
export interface SepaContent {
  type: "sepa";
  /** Beneficiary name */
  name: string;
  iban: string;
  bic?: string;
  /** Euros */
  amount?: string;
  /** Structured creditor reference (ISO 11649, RF…) */
  reference?: string;
  /** Unstructured remittance information */
  remittance?: string;
}

/** PayNow (Singapore), SGQR / EMV merchant-presented. */
export interface PayNowContent {
  type: "paynow";
  proxyType: "mobile" | "uen";
  /** Singapore mobile number or company UEN */
  proxy: string;
  amount?: string;
  /** Whether the payer may change the amount (default yes) */
  editable?: boolean;
  /** Bill number or reference */
  reference?: string;
  /** Last day the code works, YYYY-MM-DD */
  expiry?: string;
  /** Name shown in the payer's app */
  name?: string;
}

/** PromptPay (Thailand), Thai QR Payment / EMV merchant-presented. */
export interface PromptPayContent {
  type: "promptpay";
  proxyType: "mobile" | "id" | "ewallet";
  /** Thai mobile number, 13-digit national or tax ID, or 15-digit e-wallet ID */
  proxy: string;
  amount?: string;
}

/** VietQR (Vietnam), NAPAS / EMV merchant-presented. */
export interface VietQrContent {
  type: "vietqr";
  /** The bank's 6-digit BIN (lib/vietqr-banks.ts) */
  bankBin: string;
  accountType: "account" | "card";
  accountNumber: string;
  /** Vietnamese dong, whole numbers */
  amount?: string;
  message?: string;
}

/** Cash App: a $Cashtag link. */
export interface CashAppContent {
  type: "cashapp";
  username: string;
}

/** Revolut: a revolut.me link. */
export interface RevolutContent {
  type: "revolut";
  username: string;
}

/** Telegram: a username, channel or group, or a phone number. */
export interface TelegramContent {
  type: "telegram";
  username?: string;
  phoneNumber?: string;
}

/** Signal: a phone number, or a username or group link from the app. */
export interface SignalContent {
  type: "signal";
  phoneNumber?: string;
  /** A signal.me username link or signal.group link */
  link?: string;
}

/** Discord: a server invite. */
export interface DiscordContent {
  type: "discord";
  /** Invite code or invite link */
  invite: string;
}

/** LINE: add a friend by LINE ID, or an official account (@id). */
export interface LineContent {
  type: "line";
  username: string;
}

/** Bluesky: a profile by handle. */
export interface BlueskyContent {
  type: "bluesky";
  handle: string;
}

/** Mastodon (and other fediverse servers): @user@server. */
export interface MastodonContent {
  type: "mastodon";
  handle: string;
}

/** Twitch: a channel. */
export interface TwitchContent {
  type: "twitch";
  username: string;
}

/** SoundCloud: a profile, or a track or playlist link. */
export interface SoundCloudContent {
  type: "soundcloud";
  username: string;
}

/** Zoom: a meeting ID or invite link. */
export interface ZoomContent {
  type: "zoom";
  meeting: string;
}

/** Google Meet: a meeting code or link. */
export interface GoogleMeetContent {
  type: "google-meet";
  meeting: string;
}

/** Waze: directions to an address or coordinates. */
export interface WazeContent {
  type: "waze";
  location: string;
  /** Start navigating right away (default yes) */
  navigate?: boolean;
}

/** A crypto payment request (BIP-21 style URI) to one address. */
interface CryptoPaymentFields {
  address: string;
  amount?: string;
  label?: string;
  message?: string;
}

export interface LitecoinContent extends CryptoPaymentFields {
  type: "litecoin";
}

export interface DogecoinContent extends CryptoPaymentFields {
  type: "dogecoin";
}

export interface BitcoinCashContent extends CryptoPaymentFields {
  type: "bitcoincash";
}

/** Solana Pay transfer request. */
export interface SolanaContent extends CryptoPaymentFields {
  type: "solana";
}

/** Monero payment request (monero: URI). */
export interface MoneroContent extends CryptoPaymentFields {
  type: "monero";
}

// ─── end of the 2026-11-11 types ────────────────────────────────────────────

/**
 * Union type for all content configurations
 */
export type QRContentConfig =
  | UrlContent
  | TextContent
  | EmailContent
  | PhoneContent
  | SmsContent
  | WhatsAppContent
  | WifiContent
  | VCardContent
  | MapsContent
  | FacebookContent
  | InstagramContent
  | RedditContent
  | TikTokContent
  | TwitterContent
  | LinkedInContent
  | YouTubeContent
  | PinterestContent
  | SnapchatContent
  | ThreadsContent
  | UPIContent
  | PayPalContent
  | GoogleReviewContent
  | VenmoContent
  | SpotifyContent
  | BitcoinContent
  | EthereumContent
  | EtsyContent
  | DubshContent
  | GoogleDriveContent
  | AttendanceContent
  | AmazonContent
  | FlipkartContent
  | CalcomContent
  | PixContent
  | SepaContent
  | PayNowContent
  | PromptPayContent
  | VietQrContent
  | CashAppContent
  | RevolutContent
  | TelegramContent
  | SignalContent
  | DiscordContent
  | LineContent
  | BlueskyContent
  | MastodonContent
  | TwitchContent
  | SoundCloudContent
  | ZoomContent
  | GoogleMeetContent
  | WazeContent
  | LitecoinContent
  | DogecoinContent
  | BitcoinCashContent
  | SolanaContent
  | MoneroContent;

/**
 * Content type metadata for UI rendering
 */
export interface ContentTypeMetadata {
  type: ContentType;
  label: string;
  /** iconsax icon name (resolved in components/editor/content-type-icons.tsx) */
  icon: string;
  /** One line shown under the label in the type picker */
  description: string;
  /** Extra words people search for (aliases, brands, abbreviations) */
  keywords?: string[];
}

export const CONTENT_TYPES_METADATA: ContentTypeMetadata[] = [
  {
    type: "url",
    label: "URL",
    icon: "Link",
    description: "Open any website or web page",
    keywords: ["link", "website", "web", "site", "page", "landing"],
  },
  {
    type: "text",
    label: "Plain Text",
    icon: "Text",
    description: "Show a short note or message",
    keywords: ["text", "note", "message", "words", "plain"],
  },
  {
    type: "email",
    label: "Email",
    icon: "Sms",
    description: "Draft an email with a subject and body",
    keywords: ["mail", "e-mail", "gmail", "inbox", "mailto"],
  },
  {
    type: "phone",
    label: "Phone",
    icon: "Call",
    description: "Call a number with one tap",
    keywords: ["call", "tel", "telephone", "mobile", "number"],
  },
  {
    type: "sms",
    label: "SMS",
    icon: "MessageText",
    description: "Open a pre-filled text message",
    keywords: ["text message", "message", "imessage", "texting"],
  },
  {
    type: "whatsapp",
    label: "WhatsApp",
    icon: "brand:whatsapp",
    description: "Start a WhatsApp chat with a message",
    keywords: ["wa", "chat", "whats app", "message"],
  },
  {
    type: "wifi",
    label: "WiFi",
    icon: "Wifi",
    description: "Join a Wi-Fi network without typing",
    keywords: [
      "wi-fi",
      "wireless",
      "network",
      "password",
      "internet",
      "hotspot",
    ],
  },
  {
    type: "vcard",
    label: "Contact",
    icon: "Personalcard",
    description: "Save your contact card to a phone",
    keywords: [
      "vcard",
      "business card",
      "visiting card",
      "contact card",
      "address book",
    ],
  },
  {
    type: "maps",
    label: "Location",
    icon: "Location",
    description: "Open a place or directions in Maps",
    keywords: [
      "map",
      "maps",
      "directions",
      "address",
      "google maps",
      "navigate",
    ],
  },
  {
    type: "facebook",
    label: "Facebook",
    icon: "brand:facebook",
    description: "Open a Facebook page or profile",
    keywords: ["fb", "meta", "social"],
  },
  {
    type: "instagram",
    label: "Instagram",
    icon: "brand:instagram",
    description: "Open an Instagram profile",
    keywords: ["insta", "ig", "social"],
  },
  {
    type: "reddit",
    label: "Reddit",
    icon: "brand:reddit",
    description: "Open a subreddit or Reddit profile",
    keywords: ["subreddit", "community", "forum", "social"],
  },
  {
    type: "tiktok",
    label: "TikTok",
    icon: "brand:tiktok",
    description: "Open a TikTok profile",
    keywords: ["tik tok", "video", "social"],
  },
  {
    type: "twitter",
    label: "Twitter / X",
    icon: "brand:twitter",
    description: "Open an X (Twitter) profile",
    keywords: ["x", "tweet", "twitter", "social"],
  },
  {
    type: "linkedin",
    label: "LinkedIn",
    icon: "LinkedinLogo",
    description: "Open a LinkedIn profile or company page",
    keywords: ["cv", "resume", "jobs", "career", "social"],
  },
  {
    type: "youtube",
    label: "YouTube",
    icon: "brand:youtube",
    description: "Open a YouTube channel or video",
    keywords: ["yt", "video", "channel", "social"],
  },
  {
    type: "pinterest",
    label: "Pinterest",
    icon: "brand:pinterest",
    description: "Open a Pinterest profile",
    keywords: ["pin", "pins", "boards", "social"],
  },
  {
    type: "snapchat",
    label: "Snapchat",
    icon: "brand:snapchat",
    description: "Add you as a friend on Snapchat",
    keywords: ["snap", "social"],
  },
  {
    type: "threads",
    label: "Threads",
    icon: "brand:threads",
    description: "Open a Threads profile",
    keywords: ["meta", "social"],
  },
  {
    type: "upi",
    label: "UPI Payment",
    icon: "MoneySend",
    description: "Get paid from any UPI app in India",
    keywords: [
      "gpay",
      "google pay",
      "phonepe",
      "paytm",
      "bhim",
      "india",
      "payment",
      "pay",
    ],
  },
  {
    type: "paypal",
    label: "PayPal",
    icon: "brand:paypal",
    description: "Get paid with a PayPal.me link",
    keywords: ["paypal.me", "payment", "pay", "money"],
  },
  {
    type: "google-review",
    label: "Google Review",
    icon: "brand:google-review",
    description: "Ask customers for a Google review",
    keywords: [
      "review",
      "reviews",
      "rating",
      "google business",
      "gmb",
      "feedback",
    ],
  },
  {
    type: "venmo",
    label: "Venmo",
    icon: "brand:venmo",
    description: "Request money on Venmo",
    keywords: ["payment", "pay", "money"],
  },
  {
    type: "spotify",
    label: "Spotify",
    icon: "brand:spotify",
    description: "Play a song, album, playlist or podcast",
    keywords: ["music", "playlist", "podcast", "song", "album"],
  },
  {
    type: "bitcoin",
    label: "Bitcoin",
    icon: "brand:bitcoin",
    description: "Receive Bitcoin to your wallet",
    keywords: ["btc", "crypto", "wallet", "payment"],
  },
  {
    type: "ethereum",
    label: "Ethereum",
    icon: "brand:ethereum",
    description: "Receive ETH to your wallet",
    keywords: ["eth", "crypto", "wallet", "web3", "payment"],
  },
  {
    type: "etsy",
    label: "Etsy",
    icon: "brand:etsy",
    description: "Open your Etsy shop",
    keywords: ["shop", "store", "handmade", "shopping"],
  },
  {
    type: "dubsh",
    label: "Dub",
    icon: "Link2",
    description: "Use a Dub short link with its analytics",
    keywords: ["short link", "shortener", "dub", "link", "analytics"],
  },
  {
    type: "google-drive",
    label: "Google Drive",
    icon: "brand:google-drive",
    description: "Share a Drive file or folder",
    keywords: ["drive", "docs", "file", "pdf", "sheets", "slides", "folder"],
  },
  {
    type: "attendance",
    label: "Attendance",
    icon: "TaskSquare",
    description: "Check people in with a Google Form",
    keywords: ["form", "google forms", "check-in", "check in", "sign-in sheet"],
  },
  {
    type: "amazon",
    label: "Amazon",
    icon: "ShoppingCart",
    description: "Open an Amazon product page",
    keywords: ["product", "shop", "buy", "shopping"],
  },
  {
    type: "flipkart",
    label: "Flipkart",
    icon: "Bag2",
    description: "Open a Flipkart product page",
    keywords: ["product", "shop", "buy", "shopping", "india"],
  },
  {
    type: "calcom",
    label: "Cal.com",
    icon: "brand:calcom",
    description: "Let people book a meeting with you",
    keywords: [
      "booking",
      "meeting",
      "appointment",
      "schedule",
      "calendar",
      "calendly",
    ],
  },
  // ─── Added 2026-11-11 ─────────────────────────────────────────────────────
  {
    type: "pix",
    label: "Pix",
    icon: "brand:pix",
    description: "Get paid by Pix from any Brazilian bank",
    keywords: ["brazil", "brasil", "br code", "copia e cola", "payment", "pay"],
  },
  {
    type: "sepa",
    label: "SEPA transfer",
    icon: "brand:sepa",
    description: "Fill in a euro bank transfer (EPC)",
    keywords: [
      "epc",
      "girocode",
      "iban",
      "bank transfer",
      "euro",
      "europe",
      "payment",
    ],
  },
  {
    type: "paynow",
    label: "PayNow",
    icon: "CardSend",
    description: "Get paid by PayNow in Singapore",
    keywords: ["singapore", "sgqr", "uen", "payment", "pay", "bank transfer"],
  },
  {
    type: "promptpay",
    label: "PromptPay",
    icon: "MoneyRecive",
    description: "Get paid by PromptPay in Thailand",
    keywords: ["thailand", "thai qr", "payment", "pay", "bank transfer"],
  },
  {
    type: "vietqr",
    label: "VietQR",
    icon: "Bank",
    description: "Get a bank transfer in Vietnam",
    keywords: ["vietnam", "napas", "bank transfer", "payment", "pay"],
  },
  {
    type: "cashapp",
    label: "Cash App",
    icon: "brand:cashapp",
    description: "Get paid to your $Cashtag",
    keywords: ["cashtag", "cash app", "payment", "pay", "money"],
  },
  {
    type: "revolut",
    label: "Revolut",
    icon: "brand:revolut",
    description: "Get paid with a revolut.me link",
    keywords: ["revolut.me", "revtag", "payment", "pay", "money"],
  },
  {
    type: "telegram",
    label: "Telegram",
    icon: "brand:telegram",
    description: "Open a Telegram chat, channel or group",
    keywords: ["tg", "t.me", "channel", "group", "chat", "message"],
  },
  {
    type: "signal",
    label: "Signal",
    icon: "brand:signal",
    description: "Start a Signal chat",
    keywords: ["signal.me", "private", "chat", "message", "secure"],
  },
  {
    type: "discord",
    label: "Discord",
    icon: "brand:discord",
    description: "Invite people to your Discord server",
    keywords: ["server", "invite", "community", "gaming", "discord.gg"],
  },
  {
    type: "line",
    label: "LINE",
    icon: "brand:line",
    description: "Add you as a friend on LINE",
    keywords: ["line id", "official account", "japan", "thailand", "chat"],
  },
  {
    type: "bluesky",
    label: "Bluesky",
    icon: "brand:bluesky",
    description: "Open a Bluesky profile",
    keywords: ["bsky", "at protocol", "social"],
  },
  {
    type: "mastodon",
    label: "Mastodon",
    icon: "brand:mastodon",
    description: "Open a Mastodon or fediverse profile",
    keywords: ["fediverse", "toot", "activitypub", "social"],
  },
  {
    type: "twitch",
    label: "Twitch",
    icon: "brand:twitch",
    description: "Open a Twitch channel",
    keywords: ["stream", "streaming", "live", "gaming"],
  },
  {
    type: "soundcloud",
    label: "SoundCloud",
    icon: "brand:soundcloud",
    description: "Play a SoundCloud profile or track",
    keywords: ["music", "track", "mix", "dj", "audio"],
  },
  {
    type: "zoom",
    label: "Zoom",
    icon: "brand:zoom",
    description: "Join a Zoom meeting",
    keywords: ["meeting", "video call", "webinar", "conference call"],
  },
  {
    type: "google-meet",
    label: "Google Meet",
    icon: "brand:google-meet",
    description: "Join a Google Meet call",
    keywords: ["meet", "meeting", "video call", "hangouts"],
  },
  {
    type: "waze",
    label: "Waze",
    icon: "brand:waze",
    description: "Get directions in Waze",
    keywords: ["directions", "navigation", "navigate", "drive", "route"],
  },
  {
    type: "litecoin",
    label: "Litecoin",
    icon: "brand:litecoin",
    description: "Receive Litecoin to your wallet",
    keywords: ["ltc", "crypto", "wallet", "payment"],
  },
  {
    type: "dogecoin",
    label: "Dogecoin",
    icon: "brand:dogecoin",
    description: "Receive Dogecoin to your wallet",
    keywords: ["doge", "crypto", "wallet", "payment"],
  },
  {
    type: "bitcoincash",
    label: "Bitcoin Cash",
    icon: "brand:bitcoincash",
    description: "Receive Bitcoin Cash to your wallet",
    keywords: ["bch", "crypto", "wallet", "payment"],
  },
  {
    type: "solana",
    label: "Solana",
    icon: "brand:solana",
    description: "Receive SOL with Solana Pay",
    keywords: ["sol", "solana pay", "crypto", "wallet", "web3", "payment"],
  },
  {
    type: "monero",
    label: "Monero",
    icon: "brand:monero",
    description: "Receive Monero to your wallet",
    keywords: ["xmr", "crypto", "wallet", "privacy", "payment"],
  },
];

/**
 * Sections of the QR type picker, in order. "Popular" comes first; every
 * other category lists each type exactly once.
 */
export interface ContentCategory {
  id: string;
  label: string;
  /** iconsax icon name */
  icon: string;
  types: ContentType[];
}

export const CONTENT_CATEGORIES: ContentCategory[] = [
  {
    id: "popular",
    label: "Popular",
    icon: "Star1",
    types: [
      "url",
      "wifi",
      "vcard",
      "whatsapp",
      "instagram",
      "email",
      "maps",
      "text",
    ],
  },
  {
    id: "links",
    label: "Links & files",
    icon: "Link",
    types: ["url", "text", "google-drive", "dubsh"],
  },
  {
    id: "connect",
    label: "Contact & connect",
    icon: "Personalcard",
    types: [
      "vcard",
      "phone",
      "email",
      "sms",
      "whatsapp",
      "wifi",
      "telegram",
      "signal",
      "line",
    ],
  },
  {
    id: "social",
    label: "Social & media",
    icon: "Hashtag",
    types: [
      "instagram",
      "facebook",
      "twitter",
      "linkedin",
      "tiktok",
      "youtube",
      "threads",
      "snapchat",
      "pinterest",
      "reddit",
      "spotify",
      "discord",
      "bluesky",
      "mastodon",
      "twitch",
      "soundcloud",
    ],
  },
  {
    id: "business",
    label: "Business",
    icon: "Shop",
    types: [
      "google-review",
      "calcom",
      "attendance",
      "maps",
      "waze",
      "zoom",
      "google-meet",
    ],
  },
  {
    id: "payments",
    label: "Payments",
    icon: "WalletMoney",
    types: [
      "upi",
      "pix",
      "sepa",
      "paynow",
      "promptpay",
      "vietqr",
      "paypal",
      "venmo",
      "cashapp",
      "revolut",
    ],
  },
  {
    id: "crypto",
    label: "Crypto",
    icon: "Coin1",
    types: [
      "bitcoin",
      "ethereum",
      "solana",
      "litecoin",
      "dogecoin",
      "bitcoincash",
      "monero",
    ],
  },
  {
    id: "shopping",
    label: "Shopping",
    icon: "ShoppingCart",
    types: ["amazon", "flipkart", "etsy"],
  },
];
