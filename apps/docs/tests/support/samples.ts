import type { ContentType, QRContentConfig } from "@/types/qr-content";

/** A valid, fully filled config for every content type. */
export const SAMPLES: {
  [T in ContentType]: Extract<QRContentConfig, { type: T }>;
} = {
  url: { type: "url", url: "https://qrdx.dev/pricing?plan=pro#faq" },
  text: { type: "text", text: "Hello, QR 👋" },
  email: {
    type: "email",
    recipient: "hello@qrdx.dev",
    subject: "Hi",
    body: "Body",
  },
  phone: { type: "phone", phoneNumber: "+1 (415) 555-0132" },
  sms: { type: "sms", phoneNumber: "+14155550132", message: "Hi" },
  whatsapp: { type: "whatsapp", phoneNumber: "+14155550132", message: "Hi" },
  wifi: {
    type: "wifi",
    ssid: "Office",
    password: "correct horse",
    encryption: "WPA",
  },
  vcard: {
    type: "vcard",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "+441234567890",
  },
  maps: { type: "maps", location: "48.8584, 2.2945" },
  facebook: { type: "facebook", profileUrl: "https://www.facebook.com/qrdx" },
  instagram: { type: "instagram", username: "qrdx" },
  reddit: { type: "reddit", subreddit: "qrcodes" },
  tiktok: { type: "tiktok", username: "qrdx" },
  twitter: { type: "twitter", username: "qrdx" },
  linkedin: {
    type: "linkedin",
    profileUrl: "https://www.linkedin.com/in/qrdx",
  },
  youtube: { type: "youtube", channelUrl: "https://www.youtube.com/@qrdx" },
  pinterest: { type: "pinterest", username: "qrdx" },
  snapchat: { type: "snapchat", username: "qrdx" },
  threads: { type: "threads", username: "qrdx" },
  upi: {
    type: "upi",
    upiId: "shop@okaxis",
    name: "Chai Shop",
    amount: "49.50",
    note: "Order 12",
  },
  paypal: { type: "paypal", paypalUrl: "https://paypal.me/qrdx" },
  "google-review": {
    type: "google-review",
    placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
  },
  venmo: { type: "venmo", username: "qrdx", amount: "5", note: "Coffee" },
  spotify: { type: "spotify", uri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC" },
  bitcoin: {
    type: "bitcoin",
    address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    amount: "0.001",
  },
  ethereum: {
    type: "ethereum",
    address: "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7",
    amount: "0.5",
  },
  etsy: { type: "etsy", shopUrl: "https://www.etsy.com/shop/qrdx" },
  dubsh: { type: "dubsh", shortUrl: "https://dub.sh/qrdx" },
  attendance: { type: "attendance", formUrl: "https://forms.gle/abc123" },
  amazon: {
    type: "amazon",
    productUrl: "https://www.amazon.com/dp/B000000000",
  },
  flipkart: {
    type: "flipkart",
    productUrl: "https://www.flipkart.com/p/itm123",
  },
  calcom: { type: "calcom", bookingUrl: "https://cal.com/qrdx/30min" },
  "google-drive": {
    type: "google-drive",
    url: "https://drive.google.com/file/d/abc/view",
  },
};
