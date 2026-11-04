import type { ContentType } from "@/types/qr-content";
import type { PageCode } from "./model";
import { INDUSTRY_CODES, PLACEMENT_CODES } from "./topic-codes";
import { TYPE_CODES } from "./type-codes";

// More built-in themes are on the way (utils/qr-presets.ts). Where they would
// add the most variety here, once they land:
// - the themes on the most codes: slate, sunset, harbor, butter, monochrome,
//   rose, ice and amberMinimal (12 to 14 codes each);
// - the social and payment generator pages, where a few blues (twitter,
//   modern, gradientBlue) and greens (emerald, nature) carry most codes;
// - themes with a frame of their own for menus, tickets, Wi-Fi and contacts,
//   beyond the six industry themes (only restaurantMenu, realEstate,
//   eventTicket, guestWifi, businessCard and retailSale have one today).
// A swap is one line in type-codes.ts or topic-codes.ts; tests/page-codes/
// checks that the code still scans and that no page, group of pages or pair
// of neighbouring pages repeats a theme.

export * from "./model";
export { INDUSTRY_CODES, PLACEMENT_CODES } from "./topic-codes";
export { TYPE_CODES } from "./type-codes";

/** One code per generator group on /qr-code-generator, by group order. */
export const GENERATOR_HUB_TYPES: ContentType[] = [
  "wifi",
  "vcard",
  "instagram",
  "upi",
  "google-review",
  "etsy",
];

/** One code per industry group on /qr-codes-for. */
export const INDUSTRY_HUB_SLUGS = [
  "restaurants",
  "salons",
  "weddings",
  "nonprofits",
  "construction",
  "real-estate",
];

/** One code per placement group on /qr-codes-on. */
export const PLACEMENT_HUB_SLUGS = [
  "business-cards",
  "t-shirts",
  "table-tents",
  "envelopes",
  "billboards",
  "emails",
];

/** Placements on /tools/print-size, each linking to its sizing table. */
export const PRINT_SIZE_SLUGS = [
  "business-cards",
  "table-tents",
  "posters",
  "billboards",
];

/** Every sample code, once (the image route draws one file per code). */
export const ALL_PAGE_CODES: readonly PageCode[] = [
  ...Object.values(TYPE_CODES).flat(),
  ...Object.values(INDUSTRY_CODES).flat(),
  ...Object.values(PLACEMENT_CODES).flat(),
];

const BY_ID = new Map(ALL_PAGE_CODES.map((code) => [code.id, code]));

export const getPageCode = (id: string): PageCode | undefined => BY_ID.get(id);
