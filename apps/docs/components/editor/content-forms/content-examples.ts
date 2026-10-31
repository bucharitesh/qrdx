import type { ContentType, QRContentConfig } from "@/types/qr-content";

type Example<T extends ContentType> = Omit<
  Extract<QRContentConfig, { type: T }>,
  "type"
>;

/**
 * Made-up sample data per content type, so people exploring see a working
 * code in one click. Names, numbers and handles are fictional: phone numbers
 * use the reserved 555-01xx range, payment IDs point at no real account, and
 * crypto addresses fail their checksums so wallets refuse them.
 */
export const CONTENT_EXAMPLES: { [T in ContentType]: Example<T> } = {
  url: { url: "https://example.com/spring-menu" },
  text: {
    text: "Table 12 · Guest Wi-Fi: BloomCafe · Ask us about today's specials",
  },
  email: {
    recipient: "hello@example.com",
    subject: "Table for two on Friday",
    body: "Hi! I'd like to book a table for two at 7 pm on Friday.",
  },
  phone: { phoneNumber: "+1 202 555 0142" },
  sms: {
    phoneNumber: "+1 202 555 0142",
    message: "Hi! Confirming my booking for Friday at 7 pm.",
  },
  whatsapp: {
    phoneNumber: "+1 202 555 0142",
    message: "Hi! Are you open this Sunday?",
  },
  wifi: {
    ssid: "Bloom Café Guest",
    password: "fresh-flowers-24",
    encryption: "WPA",
    hidden: false,
  },
  vcard: {
    firstName: "Alex",
    lastName: "Rivera",
    organization: "Rivera Design Studio",
    phone: "+1 202 555 0142",
    email: "alex@example.com",
  },
  maps: { location: "37.7955, -122.3937" },
  facebook: { profileUrl: "https://www.facebook.com/bloomandleafstudio" },
  instagram: { username: "bloomandleaf.studio" },
  reddit: { subreddit: "web_design" },
  tiktok: { username: "bloomandleaf.studio" },
  twitter: { username: "bloomandleaf" },
  linkedin: { profileUrl: "https://www.linkedin.com/in/alex-rivera-example" },
  youtube: { channelUrl: "https://www.youtube.com/@bloomandleafstudio" },
  pinterest: { username: "bloomandleaf" },
  snapchat: { username: "bloomandleaf" },
  threads: { username: "bloomandleaf.studio" },
  upi: {
    upiId: "alexrivera@examplebank",
    name: "Alex Rivera",
    amount: "250",
    note: "Coffee and cake",
  },
  paypal: { paypalUrl: "https://paypal.me/bloomandleafexample" },
  "google-review": { placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" },
  venmo: { username: "Alex-Rivera-Example", amount: "12.50", note: "Lunch" },
  spotify: { uri: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" },
  bitcoin: {
    address: "bc1qexampleexampleexampleexampleexample0",
    label: "Bloom Café",
    message: "Example payment",
  },
  ethereum: { address: "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01" },
  etsy: { shopUrl: "https://www.etsy.com/shop/BloomAndLeafExample" },
  dubsh: { shortUrl: "https://dub.sh/qrdx-example", source: "manual" },
  "google-drive": {
    url: "https://drive.google.com/file/d/1ExampleSpringMenuFileId/view",
    name: "Spring menu.pdf",
    source: "manual",
  },
  attendance: {
    formUrl: "https://docs.google.com/forms/d/e/example-sign-in/viewform",
  },
  amazon: { productUrl: "https://www.amazon.com/dp/B0EXAMPLE01" },
  flipkart: {
    productUrl: "https://www.flipkart.com/example-ceramic-mug/p/itmexample01",
  },
  calcom: { bookingUrl: "https://cal.com/alex-rivera-example/30min" },
};

/** Fields that only pick a mode, so they don't count as entered content. */
const NEUTRAL_FIELDS = new Set(["type", "encryption", "source", "hidden"]);

/** True when nobody has typed anything into this type's form yet. */
export function isContentEmpty(config: QRContentConfig | undefined): boolean {
  if (!config) return true;
  return Object.entries(config).every(
    ([key, value]) =>
      NEUTRAL_FIELDS.has(key) ||
      value === undefined ||
      value === "" ||
      value === false,
  );
}

/** True while the form still holds the example, unchanged. */
export function isExampleContent(
  type: ContentType,
  config: QRContentConfig | undefined,
): boolean {
  if (!config) return false;
  const example = CONTENT_EXAMPLES[type] as Record<string, unknown>;
  const current = config as unknown as Record<string, unknown>;
  return Object.entries(example).every(
    ([key, value]) => (current[key] ?? "") === value,
  );
}
