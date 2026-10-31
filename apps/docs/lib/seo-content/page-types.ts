/**
 * Hosted page types a dynamic code can open (the landing-page engine's
 * templates). Names and descriptions must match what the page editor offers.
 */
export interface SeoPageType {
  name: string;
  description: string;
}

export const PAGE_TYPES = {
  links: {
    name: "Link list page",
    description:
      "A mobile page of buttons: website, socials, booking, reviews and more.",
  },
  business: {
    name: "Business page",
    description:
      "Opening hours, address with a map link, contact buttons and amenities.",
  },
  vcard: {
    name: "vCard Plus page",
    description:
      "A digital business card with photo, contact buttons and a Save contact button.",
  },
  menu: {
    name: "Menu page",
    description:
      "Sections and items with prices, photos, allergen and diet tags, and sold-out flags.",
  },
  coupon: {
    name: "Coupon page",
    description:
      "An offer with a code or barcode, validity dates, terms and a copy button.",
  },
  event: {
    name: "Event page",
    description:
      "Date, time, venue, organiser and add-to-calendar links, plus an .ics file for any calendar app.",
  },
  apps: {
    name: "App download page",
    description:
      "Shows the App Store button on iPhones and the Google Play button on Android.",
  },
  feedback: {
    name: "Feedback and forms page",
    description:
      "Star ratings, NPS and questions, with responses collected in your dashboard.",
  },
  pdf: {
    name: "PDF page",
    description: "An uploaded PDF people can read in the browser or download.",
  },
  images: {
    name: "Image gallery",
    description: "A grid of photos with a full-screen viewer.",
  },
  video: {
    name: "Video page",
    description: "A YouTube or Vimeo embed, or an uploaded MP4.",
  },
  mp3: {
    name: "Audio page",
    description: "An audio player with cover art and a playlist.",
  },
} as const satisfies Record<string, SeoPageType>;

export type PageTypeId = keyof typeof PAGE_TYPES;
