import type { ContentType } from "./qr-content";

/**
 * Every content type id, without the type picker's labels, descriptions and
 * keywords (CONTENT_TYPES_METADATA in ./qr-content.ts), for code that only
 * checks an id. lib/playground-links.ts ships on every page (the header's
 * account menu links the playground), so it reads this list. The type
 * below fails to compile when a ContentType is missing, and
 * tests/lib/playground-link-formats.test.ts checks it matches the metadata.
 */
export const CONTENT_TYPE_IDS = [
  "url",
  "text",
  "email",
  "phone",
  "sms",
  "whatsapp",
  "wifi",
  "vcard",
  "maps",
  "facebook",
  "instagram",
  "reddit",
  "tiktok",
  "twitter",
  "linkedin",
  "youtube",
  "pinterest",
  "snapchat",
  "threads",
  "upi",
  "paypal",
  "google-review",
  "venmo",
  "spotify",
  "bitcoin",
  "ethereum",
  "etsy",
  "dubsh",
  "attendance",
  "amazon",
  "flipkart",
  "calcom",
  "google-drive",
] as const satisfies readonly ContentType[];

type NeverListed<T extends never> = T;
/** Compiles only while CONTENT_TYPE_IDS lists every ContentType. */
export type EveryContentTypeListed = NeverListed<
  Exclude<ContentType, (typeof CONTENT_TYPE_IDS)[number]>
>;
