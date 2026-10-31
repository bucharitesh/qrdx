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
  | "google-drive";

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
  | CalcomContent;

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
    icon: "Whatsapp",
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
    icon: "Facebook",
    description: "Open a Facebook page or profile",
    keywords: ["fb", "meta", "social"],
  },
  {
    type: "instagram",
    label: "Instagram",
    icon: "Instagram",
    description: "Open an Instagram profile",
    keywords: ["insta", "ig", "social"],
  },
  {
    type: "reddit",
    label: "Reddit",
    icon: "Messages2",
    description: "Open a subreddit or Reddit profile",
    keywords: ["subreddit", "community", "forum", "social"],
  },
  {
    type: "tiktok",
    label: "TikTok",
    icon: "Musicnote",
    description: "Open a TikTok profile",
    keywords: ["tik tok", "video", "social"],
  },
  {
    type: "twitter",
    label: "Twitter / X",
    icon: "XLogo",
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
    icon: "Youtube",
    description: "Open a YouTube channel or video",
    keywords: ["yt", "video", "channel", "social"],
  },
  {
    type: "pinterest",
    label: "Pinterest",
    icon: "Bookmark",
    description: "Open a Pinterest profile",
    keywords: ["pin", "pins", "boards", "social"],
  },
  {
    type: "snapchat",
    label: "Snapchat",
    icon: "Snapchat",
    description: "Add you as a friend on Snapchat",
    keywords: ["snap", "social"],
  },
  {
    type: "threads",
    label: "Threads",
    icon: "Hashtag",
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
    icon: "Paypal",
    description: "Get paid with a PayPal.me link",
    keywords: ["paypal.me", "payment", "pay", "money"],
  },
  {
    type: "google-review",
    label: "Google Review",
    icon: "Google",
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
    icon: "WalletMoney",
    description: "Request money on Venmo",
    keywords: ["payment", "pay", "money"],
  },
  {
    type: "spotify",
    label: "Spotify",
    icon: "Spotify",
    description: "Play a song, album, playlist or podcast",
    keywords: ["music", "playlist", "podcast", "song", "album"],
  },
  {
    type: "bitcoin",
    label: "Bitcoin",
    icon: "Bitcoin",
    description: "Receive Bitcoin to your wallet",
    keywords: ["btc", "crypto", "wallet", "payment"],
  },
  {
    type: "ethereum",
    label: "Ethereum",
    icon: "Ethereum",
    description: "Receive ETH to your wallet",
    keywords: ["eth", "crypto", "wallet", "web3", "payment"],
  },
  {
    type: "etsy",
    label: "Etsy",
    icon: "Shop",
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
    icon: "GoogleDrive",
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
    icon: "CalendarTick",
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
    types: ["vcard", "phone", "email", "sms", "whatsapp", "wifi"],
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
    ],
  },
  {
    id: "business",
    label: "Business",
    icon: "Shop",
    types: ["google-review", "calcom", "attendance", "maps"],
  },
  {
    id: "payments",
    label: "Payments",
    icon: "WalletMoney",
    types: ["upi", "paypal", "venmo", "bitcoin", "ethereum"],
  },
  {
    id: "shopping",
    label: "Shopping",
    icon: "ShoppingCart",
    types: ["amazon", "flipkart", "etsy"],
  },
];
