// The brand behind each QR content type that has one, for the type pickers
// and the /qr-code-generator cards. Types left out are generic (URL, Wi-Fi,
// UPI) or their brand isn't in Simple Icons (LinkedIn, Amazon and Flipkart
// keep their existing icons: LinkedIn's own mark, generic shopping glyphs).

import type { ContentType } from "@/types/qr-content";
import type { BrandMarkSlug } from "./marks.generated";

export const CONTENT_TYPE_BRANDS = {
  whatsapp: "whatsapp",
  facebook: "facebook",
  instagram: "instagram",
  reddit: "reddit",
  tiktok: "tiktok",
  twitter: "x",
  youtube: "youtube",
  pinterest: "pinterest",
  snapchat: "snapchat",
  threads: "threads",
  paypal: "paypal",
  "google-review": "google",
  venmo: "venmo",
  spotify: "spotify",
  bitcoin: "bitcoin",
  ethereum: "ethereum",
  etsy: "etsy",
  "google-drive": "googledrive",
  calcom: "caldotcom",
} as const satisfies Partial<Record<ContentType, BrandMarkSlug>>;
