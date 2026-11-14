// Every hosted page type (landing_page.type), as plain ids: what copy
// counts ({facts.hostedPageTypes}) without loading the template registry,
// which pulls in React components. tests/lib/landing-templates.test.ts
// fails when this list and the registry (lib/landing/templates) disagree.

export const PAGE_TYPE_IDS = [
  "links",
  "social",
  "business",
  "vcard",
  "menu",
  "coupon",
  "event",
  "apps",
  "feedback",
  "product",
  "booking",
  "payment",
  "real-estate",
  "pet",
  "medical",
  "pdf",
  "images",
  "mp3",
  "video",
  "playlist",
  "custom",
] as const;

export type PageTypeIdentifier = (typeof PAGE_TYPE_IDS)[number];
