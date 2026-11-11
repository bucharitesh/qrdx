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
  // Added 2026-11-11. Bank details use the standards' own sample values or
  // unassigned numbers: the Pix key is the Banco Central's documentation
  // example, the IBAN's bank code 12345678 is unassigned, and the PayNow UEN,
  // PromptPay ID and VietQR account are all zeros.
  pix: {
    pixKey: "123e4567-e12b-12d1-a456-426655440000",
    name: "Fulano de Tal",
    city: "Brasilia",
    amount: "12.50",
    message: "Example payment",
  },
  sepa: {
    name: "Bloom Cafe Example",
    iban: "DE58 1234 5678 0123 4567 89",
    amount: "12.50",
    remittance: "Example invoice 1024",
  },
  paynow: {
    proxyType: "uen",
    proxy: "T00XX0000X",
    name: "Bloom Cafe Example",
    amount: "12.50",
    editable: false,
    reference: "EXAMPLE1024",
  },
  promptpay: { proxyType: "id", proxy: "0000000000000", amount: "120" },
  vietqr: {
    bankBin: "970436",
    accountType: "account",
    accountNumber: "0000000000",
    amount: "50000",
    message: "Example payment",
  },
  cashapp: { username: "$BloomAndLeafExample" },
  revolut: { username: "bloomandleafexample" },
  telegram: { username: "bloomandleafstudio" },
  signal: { phoneNumber: "+1 202 555 0142" },
  discord: { invite: "https://discord.gg/BloomLeafExample" },
  line: { username: "bloomandleaf-example" },
  bluesky: { handle: "bloomandleaf.bsky.social" },
  mastodon: { handle: "@bloomandleaf@mastodon.social" },
  twitch: { username: "bloomandleafstudio" },
  soundcloud: { username: "bloomandleaf-studio" },
  zoom: { meeting: "123 4567 8901" },
  "google-meet": { meeting: "abc-defg-hij" },
  waze: { location: "37.7955, -122.3937", navigate: true },
  litecoin: {
    address: "ltc1qexampleexampleexampleexampleexample0",
    label: "Bloom Café",
    message: "Example payment",
  },
  dogecoin: {
    address: "DTestDemoWa11etTestDemoWa11etTestD",
    label: "Bloom Café",
  },
  bitcoincash: {
    address: "qexampleexampleexampleexampleexampleexampl",
    label: "Bloom Café",
  },
  solana: {
    address: "DemoWa11etAddressForTheQRdxExamp1eDemo",
    label: "Bloom Café",
    message: "Example payment",
  },
  monero: {
    address:
      "4DemoWa11etAddressForTheQRdxExamp1eDemoWa11etAddressForTheQRdxExamp1eDemoWa11etAddressForTheQRd",
    label: "Bloom Café",
  },
};

/** Fields that only pick a mode, so they don't count as entered content. */
const NEUTRAL_FIELDS = new Set([
  "type",
  "encryption",
  "source",
  "hidden",
  // Added 2026-11-11: choices and switches with a default
  "proxyType",
  "accountType",
  "editable",
  "navigate",
]);

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
