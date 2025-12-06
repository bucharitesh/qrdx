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
  | "app-stores";

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
  | AppStoresContent;

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
    types: ["url", "email", "phone", "whatsapp", "vcard"],
  },
  {
    id: "popular",
    label: "Popular",
    icon: null,
    types: ["url", "email", "phone", "whatsapp"],
  },
  {
    id: "messaging",
    label: "Messaging",
    icon: "MessageCircle",
    types: ["sms", "whatsapp", "email"],
  },
  {
    id: "business",
    label: "Business",
    icon: "Store",
    types: ["vcard", "url", "maps", "app-stores"],
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
    types: ["url", "email", "phone", "whatsapp"] as ContentType[],
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
