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
  | "calcom";

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
  icon: string; // Lucide icon name
  description: string;
}

export const CONTENT_TYPES_METADATA: ContentTypeMetadata[] = [
  {
    type: "url",
    label: "URL",
    icon: "Link",
    description: "Website link",
  },
  {
    type: "text",
    label: "Plain Text",
    icon: "FileText",
    description: "Plain text content",
  },
  {
    type: "email",
    label: "Email",
    icon: "Mail",
    description: "Send an email",
  },
  {
    type: "phone",
    label: "Phone",
    icon: "Phone",
    description: "Make a phone call",
  },
  {
    type: "sms",
    label: "SMS",
    icon: "MessageSquare",
    description: "Send a text message",
  },
  {
    type: "whatsapp",
    label: "WhatsApp",
    icon: "MessageCircle",
    description: "Open WhatsApp chat",
  },
  {
    type: "wifi",
    label: "WiFi",
    icon: "Wifi",
    description: "Connect to WiFi",
  },
  {
    type: "vcard",
    label: "Contact",
    icon: "UserCircle",
    description: "Save contact info",
  },
  {
    type: "maps",
    label: "Location",
    icon: "MapPin",
    description: "Open in Google Maps",
  },
  {
    type: "facebook",
    label: "Facebook",
    icon: "Share2",
    description: "Link to Facebook profile",
  },
  {
    type: "instagram",
    label: "Instagram",
    icon: "Instagram",
    description: "Link to Instagram profile",
  },
  {
    type: "reddit",
    label: "Reddit",
    icon: "MessageCircle",
    description: "Link to Reddit profile/subreddit",
  },
  {
    type: "tiktok",
    label: "TikTok",
    icon: "Video",
    description: "Link to TikTok profile",
  },
  {
    type: "twitter",
    label: "Twitter / X",
    icon: "Twitter",
    description: "Link to Twitter/X profile",
  },
  {
    type: "linkedin",
    label: "LinkedIn",
    icon: "Linkedin",
    description: "Link to LinkedIn profile",
  },
  {
    type: "youtube",
    label: "YouTube",
    icon: "Youtube",
    description: "Link to YouTube channel/video",
  },
  {
    type: "pinterest",
    label: "Pinterest",
    icon: "Image",
    description: "Link to Pinterest profile",
  },
  {
    type: "snapchat",
    label: "Snapchat",
    icon: "Camera",
    description: "Link to Snapchat profile",
  },
  {
    type: "threads",
    label: "Threads",
    icon: "AtSign",
    description: "Link to Threads profile",
  },
  {
    type: "upi",
    label: "UPI Payment",
    icon: "CreditCard",
    description: "UPI payment link (India)",
  },
  {
    type: "paypal",
    label: "PayPal",
    icon: "DollarSign",
    description: "PayPal payment link",
  },
  {
    type: "google-review",
    label: "Google Review",
    icon: "Star",
    description: "Link to Google Business review",
  },
  {
    type: "venmo",
    label: "Venmo",
    icon: "DollarSign",
    description: "Venmo payment request",
  },
  {
    type: "spotify",
    label: "Spotify",
    icon: "Music",
    description: "Link to Spotify content",
  },
  {
    type: "bitcoin",
    label: "Bitcoin",
    icon: "Bitcoin",
    description: "Bitcoin payment address",
  },
  {
    type: "ethereum",
    label: "Ethereum",
    icon: "Hexagon",
    description: "Ethereum payment address",
  },
  {
    type: "etsy",
    label: "Etsy",
    icon: "Store",
    description: "Link to Etsy shop",
  },
  {
    type: "dubsh",
    label: "Dub.sh",
    icon: "Link2",
    description: "Dub.sh short link",
  },
  {
    type: "attendance",
    label: "Attendance",
    icon: "ClipboardCheck",
    description: "Google Form for attendance",
  },
  {
    type: "amazon",
    label: "Amazon",
    icon: "ShoppingCart",
    description: "Amazon product link",
  },
  {
    type: "flipkart",
    label: "Flipkart",
    icon: "ShoppingBag",
    description: "Flipkart product link",
  },
  {
    type: "calcom",
    label: "Cal.com",
    icon: "Calendar",
    description: "Cal.com booking link",
  },
];

/**
 * Content type categories for navigation
 */
export interface ContentCategory {
  id: string;
  label: string;
  icon: string | null;
  types: ContentType[];
}

export const CONTENT_CATEGORIES: ContentCategory[] = [
  {
    id: "for-you",
    label: "For you",
    icon: "Sparkles",
    types: [
      "url",
      "text",
      "email",
      "phone",
      "whatsapp",
      "vcard",
      "instagram",
      "facebook",
      "calcom",
    ],
  },
  {
    id: "popular",
    label: "Popular",
    icon: null,
    types: [
      "url",
      "text",
      "email",
      "phone",
      "whatsapp",
      "instagram",
      "facebook",
      "twitter",
      "spotify",
    ],
  },
  {
    id: "messaging",
    label: "Messaging",
    icon: "MessageCircle",
    types: ["sms", "whatsapp", "email"],
  },
  {
    id: "social-media",
    label: "Social Media",
    icon: "Share2",
    types: [
      "facebook",
      "instagram",
      "twitter",
      "linkedin",
      "tiktok",
      "youtube",
      "reddit",
      "snapchat",
      "pinterest",
      "threads",
      "spotify",
    ],
  },
  {
    id: "payments",
    label: "Payments",
    icon: "CreditCard",
    types: ["upi", "paypal", "venmo", "bitcoin", "ethereum"],
  },
  {
    id: "business",
    label: "Business",
    icon: "Store",
    types: [
      "vcard",
      "url",
      "maps",
      "linkedin",
      "google-review",
      "calcom",
      "attendance",
    ],
  },
  {
    id: "e-commerce",
    label: "E-commerce",
    icon: "ShoppingCart",
    types: ["amazon", "flipkart", "etsy"],
  },
  {
    id: "utilities",
    label: "Utilities",
    icon: "Wrench",
    types: ["dubsh", "attendance", "calcom"],
  },
  {
    id: "connectivity",
    label: "Connectivity",
    icon: "Wifi",
    types: ["wifi", "phone"],
  },
];

/**
 * Sections to display in "For You" view
 */
export const FOR_YOU_SECTIONS = [
  {
    id: "popular",
    title: "Popular",
    types: [
      "url",
      "text",
      "email",
      "phone",
      "whatsapp",
      "instagram",
      "facebook",
      "spotify",
    ] as ContentType[],
  },
  {
    id: "social-media",
    title: "Social Media",
    types: [
      "instagram",
      "facebook",
      "twitter",
      "linkedin",
      "tiktok",
      "youtube",
      "spotify",
    ] as ContentType[],
  },
  {
    id: "payments",
    title: "Payments",
    types: ["upi", "paypal", "venmo", "bitcoin", "ethereum"] as ContentType[],
  },
  {
    id: "messaging",
    title: "Messaging & Communication",
    types: ["sms", "whatsapp", "email"] as ContentType[],
  },
  {
    id: "business",
    title: "Business & Professional",
    types: [
      "vcard",
      "url",
      "maps",
      "google-review",
      "calcom",
      "attendance",
    ] as ContentType[],
  },
  {
    id: "e-commerce",
    title: "E-commerce",
    types: ["amazon", "flipkart", "etsy"] as ContentType[],
  },
];
