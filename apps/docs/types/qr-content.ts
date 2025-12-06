/**
 * QR Code Content Types
 * Defines all supported content types and their configurations
 */

export type ContentType =
  | "url"
  | "email"
  | "phone"
  | "sms"
  | "whatsapp"
  | "wifi"
  | "vcard"
  | "maps"
  | "app-stores"
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
  | "paypal";

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
 * App Store Links Content
 */
export interface AppStoresContent {
  type: "app-stores";
  iosUrl?: string;
  androidUrl?: string;
  fallbackUrl?: string;
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
 * Union type for all content configurations
 */
export type QRContentConfig =
  | UrlContent
  | EmailContent
  | PhoneContent
  | SmsContent
  | WhatsAppContent
  | WifiContent
  | VCardContent
  | MapsContent
  | AppStoresContent
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
  | PayPalContent;

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
    label: "URL / Text",
    icon: "Link",
    description: "Website link or plain text",
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
    type: "app-stores",
    label: "App Store",
    icon: "Store",
    description: "Download app link",
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
      "email",
      "phone",
      "whatsapp",
      "vcard",
      "instagram",
      "facebook",
    ],
  },
  {
    id: "popular",
    label: "Popular",
    icon: null,
    types: [
      "url",
      "email",
      "phone",
      "whatsapp",
      "instagram",
      "facebook",
      "twitter",
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
    ],
  },
  {
    id: "payments",
    label: "Payments",
    icon: "CreditCard",
    types: ["upi", "paypal"],
  },
  {
    id: "business",
    label: "Business",
    icon: "Store",
    types: ["vcard", "url", "maps", "app-stores", "linkedin"],
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
      "email",
      "phone",
      "whatsapp",
      "instagram",
      "facebook",
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
    ] as ContentType[],
  },
  {
    id: "payments",
    title: "Payments",
    types: ["upi", "paypal"] as ContentType[],
  },
  {
    id: "messaging",
    title: "Messaging & Communication",
    types: ["sms", "whatsapp", "email"] as ContentType[],
  },
  {
    id: "business",
    title: "Business & Professional",
    types: ["vcard", "url", "maps", "app-stores"] as ContentType[],
  },
];
