// QRdx's own sample content for the playground's forms: what a link with
// `sample=1` (lib/playground-links.ts) fills in, so an example from a
// marketing page opens as a working code the visitor edits. The link only
// carries the flag; the values live here, so no link can put content of its
// own in a form.
//
// Generic values only: example.com, a public place, each platform's own
// account. Never contact or payment details, real or made up (no names,
// phone numbers, email addresses, payment handles or wallets), and never a
// placeholder handle that could be a stranger's account. Types without a
// generic sample (contacts, phone, email, payments, bookings, forms, shops,
// and the signed-in Dub and Drive types) open with their empty form.
// tests/lib/playground-samples.test.ts checks every value against the
// form's own validation.

import type { ContentType, QRContentConfig } from "@/types/qr-content";

/** A sample greeting, as on the home wall. */
const GREETING = "Hello from QRdx";

export const PLAYGROUND_SAMPLES = {
  url: { type: "url", url: "https://example.com/" },
  text: { type: "text", text: GREETING },
  wifi: {
    type: "wifi",
    ssid: "QRdx Sample",
    password: "sample-only",
    encryption: "WPA",
  },
  maps: { type: "maps", location: "Eiffel Tower, Paris" },
  facebook: {
    type: "facebook",
    profileUrl: "https://www.facebook.com/facebook",
  },
  instagram: { type: "instagram", username: "instagram" },
  reddit: { type: "reddit", subreddit: "reddit" },
  tiktok: { type: "tiktok", username: "tiktok" },
  twitter: { type: "twitter", username: "X" },
  linkedin: {
    type: "linkedin",
    profileUrl: "https://www.linkedin.com/company/linkedin",
  },
  youtube: { type: "youtube", channelUrl: "https://www.youtube.com/@YouTube" },
  pinterest: { type: "pinterest", username: "pinterest" },
  snapchat: { type: "snapchat", username: "teamsnapchat" },
  threads: { type: "threads", username: "threads" },
  spotify: {
    type: "spotify",
    // Spotify's own Today's Top Hits playlist.
    uri: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  },
  "google-review": {
    type: "google-review",
    // Google's documented sample place ID.
    placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
  },
  amazon: { type: "amazon", productUrl: "https://www.amazon.com/" },
  flipkart: { type: "flipkart", productUrl: "https://www.flipkart.com/" },
} as const satisfies {
  [Type in ContentType]?: Extract<QRContentConfig, { type: Type }>;
};

export type SampledType = keyof typeof PLAYGROUND_SAMPLES;

/** QRdx's sample for a content type, or undefined when it has none. */
export function playgroundSample(
  type: ContentType,
): QRContentConfig | undefined {
  return (PLAYGROUND_SAMPLES as Partial<Record<ContentType, QRContentConfig>>)[
    type
  ];
}

/** Whether a link to this type can ask for a sample. */
export const hasPlaygroundSample = (type: ContentType): type is SampledType =>
  type in PLAYGROUND_SAMPLES;
