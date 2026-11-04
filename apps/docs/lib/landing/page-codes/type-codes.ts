import type { ContentType } from "@/types/qr-content";
import { codesFor, framed, official, type TileSpec, tile } from "./build";
import type { PageCode } from "./model";
import {
  demoAs,
  email,
  generatorAs,
  phone,
  place,
  SAMPLE_PHONES,
  type SampleValue,
  site,
  sms,
  text,
  upi,
  vcard,
  whatsapp,
  wifi,
} from "./values";

/**
 * Four designs on every /qr-code-generator/<type> page: the type's own
 * content in four built-in themes, each with a frame that fits where such a
 * code is printed. No theme repeats on a page.
 */

const [P1, P2, P3, P4] = SAMPLE_PHONES;

/** The same demo page, drawn as `type`, for the services QRdx can't sample. */
const as = (type: ContentType) => ({
  links: (id: string): SampleValue => demoAs(type, "links", id),
  page: (pageType: string, id: string): SampleValue =>
    demoAs(type, pageType, id),
  generator: (): SampleValue => generatorAs(type),
});

const facebook = as("facebook");
const instagram = as("instagram");
const reddit = as("reddit");
const tiktok = as("tiktok");
const twitter = as("twitter");
const linkedin = as("linkedin");
const youtube = as("youtube");
const pinterest = as("pinterest");
const snapchat = as("snapchat");
const threads = as("threads");
const spotify = as("spotify");
const paypal = as("paypal");
const review = as("google-review");
const venmo = as("venmo");
const bitcoin = as("bitcoin");
const ethereum = as("ethereum");
const etsy = as("etsy");
const dubsh = as("dubsh");
const drive = as("google-drive");
const attendance = as("attendance");
const amazon = as("amazon");
const flipkart = as("flipkart");
const calcom = as("calcom");

const TYPE_TILES: Record<ContentType, TileSpec[]> = {
  url: [
    tile(
      "Landing page",
      site("/"),
      "modern",
      framed("banner-bottom", "Visit our website"),
    ),
    tile("Product launch", site("/playground"), "rainbow", null),
    tile(
      "Shop window",
      site("/templates"),
      "terracotta",
      official("shop-window"),
    ),
    tile("App page", site("/pricing"), "boldTech", official("get-the-app")),
  ],
  text: [
    tile(
      "Locker note",
      text("Locker 14: ask reception for the key."),
      "minimal",
      framed("border", "Locker 14"),
    ),
    tile(
      "Hidden message",
      text("Hello from QRdx"),
      "lavender",
      framed("speech-bubble", "Read me"),
    ),
    tile(
      "Table number",
      text("Table 12"),
      "butter",
      framed("badge", "Table 12"),
    ),
    tile(
      "Offline note",
      text("Sample note: this code works offline."),
      "fog",
      null,
    ),
  ],
  email: [
    tile(
      "Contact us",
      email("hello@example.com", "Hello from QRdx"),
      "twitter",
      framed("envelope", "Email us"),
    ),
    tile(
      "Support",
      email("support@example.com", "Help with my order"),
      "slate",
      framed("chat-bubble", "Need help?"),
    ),
    tile(
      "Careers",
      email("jobs@example.com", "Application"),
      "monochrome",
      framed("banner-bottom", "Join the team"),
    ),
    tile(
      "RSVP by email",
      email("events@example.com", "Count me in"),
      "rose",
      official("rsvp-card", "Email to RSVP"),
    ),
  ],
  phone: [
    tile("Call us", phone(P1), "retro", framed("banner-bottom", "Call us")),
    tile("Hotline", phone(P2), "electric", framed("sticker", "Call now")),
    tile("Book a ride", phone(P3), "sunset", framed("tag", "Book a ride")),
    tile("Reception", phone(P4), "folio", framed("phone", "Tap to call")),
  ],
  sms: [
    tile(
      "Text to join",
      sms(P1, "JOIN"),
      "candyland",
      framed("speech-bubble-top", "Text JOIN"),
    ),
    tile(
      "Order updates",
      sms(P2, "UPDATES"),
      "ice",
      framed("chat-bubble", "Text us"),
    ),
    tile(
      "Vote by text",
      sms(P3, "VOTE"),
      "vibrant",
      framed("circle", "Vote now"),
    ),
    tile(
      "Waitlist",
      sms(P4, "WAITLIST"),
      "mint",
      framed("banner-bottom", "Join the waitlist"),
    ),
  ],
  whatsapp: [
    tile(
      "Chat with us",
      whatsapp(P1, "Hello from QRdx"),
      "message",
      framed("chat-bubble", "Chat on WhatsApp"),
    ),
    tile(
      "Book by chat",
      whatsapp(P2, "I'd like to book"),
      "emerald",
      official("book-now", "Book on WhatsApp"),
    ),
    tile(
      "Order by chat",
      whatsapp(P3, "I'd like to order"),
      "nature",
      framed("speech-bubble", "Order by chat"),
    ),
    tile("Support", whatsapp(P4, "I need help"), "gradientForest", null),
  ],
  wifi: [
    tile(
      "Café counter",
      wifi("QRdx Sample Café"),
      "caffeine",
      official("wifi-card", undefined, "QRdx Sample Café"),
    ),
    tile("Hotel room", wifi("QRdx Sample Hotel"), "guestWifi"),
    tile(
      "Office lobby",
      wifi("QRdx Sample Office"),
      "ice",
      framed("badge", "Free Wi-Fi"),
    ),
    tile(
      "Guest card",
      wifi("QRdx Sample Guest"),
      "royal",
      framed("banner-top-bottom", "Guest Wi-Fi", "Scan to connect"),
    ),
  ],
  vcard: [
    tile(
      "Business card",
      vcard("Sam", "Sample", "sam@example.com"),
      "folio",
      official("save-contact"),
    ),
    tile(
      "Conference badge",
      vcard("Alex", "Example", "alex@example.com"),
      "amberMinimal",
      framed("badge", "Save my contact"),
    ),
    tile(
      "Email signature",
      vcard("Riya", "Sample", "riya@example.com"),
      "classic",
      null,
    ),
    tile(
      "Realtor sign",
      vcard("Jo", "Example", "jo@example.com"),
      "realEstate",
    ),
  ],
  maps: [
    tile(
      "Find us",
      place("goldenGatePark"),
      "nature",
      official("check-in", "Find us here"),
    ),
    tile(
      "Trailhead",
      place("hydePark"),
      "gradientForest",
      framed("circle", "Trail map", "Start here"),
    ),
    tile(
      "Directions",
      place("centralPark"),
      "sunset",
      framed("banner-bottom", "Get directions"),
    ),
    tile("Landmark", place("eiffelTower"), "jade", null),
  ],
  facebook: [
    tile(
      "Follow us",
      facebook.links("shop"),
      "twitter",
      official("follow-us", "Like our page"),
    ),
    tile("Facebook event", facebook.page("event", "party"), "eventTicket"),
    tile(
      "Group",
      facebook.links("minimal"),
      "ice",
      framed("speech-bubble", "Join our group"),
    ),
    tile(
      "Shop",
      facebook.page("business", "local-shop"),
      "spiderman",
      framed("tag", "Shop our page"),
    ),
  ],
  instagram: [
    tile(
      "Link in bio",
      instagram.links("creator"),
      "instagram",
      official("follow-us"),
    ),
    tile(
      "Creator",
      instagram.links("musician"),
      "gradientSunset",
      framed("polaroid", "Follow along"),
    ),
    tile(
      "Shop feed",
      instagram.links("shop"),
      "candyland",
      framed("phone", "See the feed"),
    ),
    tile("Studio", instagram.page("business", "studio"), "rose", null),
  ],
  reddit: [
    tile(
      "Community",
      reddit.links("minimal"),
      "fire",
      official("follow-us", "Join the subreddit"),
    ),
    tile(
      "AMA",
      reddit.page("event", "webinar"),
      "sunset",
      framed("speech-bubble", "Ask us anything"),
    ),
    tile(
      "Thread",
      reddit.links("podcast"),
      "retro",
      framed("banner-bottom", "Join the thread"),
    ),
    tile(
      "Discussion",
      reddit.generator(),
      "monochrome",
      framed("chat-bubble", "Discuss"),
    ),
  ],
  tiktok: [
    tile(
      "Follow",
      tiktok.links("creator"),
      "electric",
      official("follow-us", "Follow on TikTok"),
    ),
    tile(
      "Challenge",
      tiktok.page("event", "party"),
      "vibrant",
      framed("sticker", "Join the challenge"),
    ),
    tile(
      "Watch the clip",
      tiktok.links("musician"),
      "boldTech",
      framed("phone", "Watch the clip"),
    ),
    tile("Behind the scenes", tiktok.generator(), "gradientPurple", null),
  ],
  twitter: [
    tile(
      "Follow",
      twitter.links("minimal"),
      "classic",
      official("follow-us", "Follow us on X"),
    ),
    tile(
      "Live updates",
      twitter.page("event", "conference"),
      "twitter",
      framed("banner-top", "Live updates"),
    ),
    tile(
      "Thread",
      twitter.links("podcast"),
      "slate",
      framed("speech-bubble", "Read the thread"),
    ),
    tile(
      "Conversation",
      twitter.generator(),
      "minimal",
      framed("border", "Join the conversation"),
    ),
  ],
  linkedin: [
    tile(
      "Connect",
      linkedin.page("vcard", "classic"),
      "harbor",
      official("save-contact", "Connect on LinkedIn"),
    ),
    tile(
      "Hiring",
      linkedin.page("feedback", "sign-up"),
      "modern",
      framed("banner-bottom", "We're hiring"),
    ),
    tile(
      "Company page",
      linkedin.page("business", "professional"),
      "monochrome",
      framed("rounded-border", "Follow our page"),
    ),
    tile(
      "Speaker",
      linkedin.page("vcard", "minimal"),
      "royal",
      framed("badge", "Let's connect"),
    ),
  ],
  youtube: [
    tile(
      "Watch",
      youtube.links("creator"),
      "retro",
      framed("phone", "Watch the video"),
    ),
    tile(
      "Subscribe",
      youtube.links("musician"),
      "vibrant",
      official("follow-us", "Subscribe"),
    ),
    tile(
      "Tutorial",
      youtube.page("apps", "app-launch"),
      "spiderman",
      official("product-info", "Watch the tutorial"),
    ),
    tile("Channel", youtube.generator(), "bordeaux", null),
  ],
  pinterest: [
    tile(
      "Boards",
      pinterest.links("creator"),
      "rose",
      official("follow-us", "See our boards"),
    ),
    tile(
      "Recipe",
      pinterest.page("menu", "juice-bar"),
      "butter",
      framed("menu-card", "Get the recipe", "Pin it for later"),
    ),
    tile(
      "Mood board",
      pinterest.links("minimal"),
      "amethystHaze",
      framed("polaroid", "Save the idea"),
    ),
    tile(
      "Shop the look",
      pinterest.links("shop"),
      "sweetheart",
      framed("tag", "Shop the look"),
    ),
  ],
  snapchat: [
    tile(
      "Add us",
      snapchat.links("creator"),
      "amberMinimal",
      official("follow-us", "Add us on Snapchat"),
    ),
    tile(
      "Lens",
      snapchat.page("event", "party"),
      "popsicle",
      framed("sticker", "Unlock the lens"),
    ),
    tile(
      "Story",
      snapchat.links("musician"),
      "pacman",
      framed("speech-bubble", "Watch our story"),
    ),
    tile("Friends", snapchat.generator(), "bubblegum", null),
  ],
  threads: [
    tile(
      "Follow",
      threads.links("minimal"),
      "fog",
      official("follow-us", "Follow on Threads"),
    ),
    tile(
      "Conversation",
      threads.links("podcast"),
      "gilt",
      framed("chat-bubble", "Join the chat"),
    ),
    tile(
      "Say hello",
      threads.links("creator"),
      "lavender",
      framed("speech-bubble-top", "Say hello"),
    ),
    tile("Updates", threads.generator(), "folio", null),
  ],
  spotify: [
    tile(
      "Playlist",
      spotify.links("musician"),
      "emerald",
      official("audio-guide", "Play the playlist"),
    ),
    tile(
      "New album",
      spotify.links("creator"),
      "gradientForest",
      framed("circle", "New album", "Press play"),
    ),
    tile(
      "Podcast",
      spotify.links("podcast"),
      "nature",
      framed("phone", "Listen on the go"),
    ),
    tile(
      "Gig poster",
      spotify.page("event", "party"),
      "mint",
      framed("ticket", "See us live"),
    ),
  ],
  upi: [
    tile(
      "Shop counter",
      upi("QRdx Sample"),
      "jade",
      official("scan-to-pay", "Pay with any UPI app"),
    ),
    tile(
      "Market stall",
      upi("Sample Stall"),
      "diya",
      framed("tag", "Pay with UPI"),
    ),
    tile(
      "Delivery",
      upi("Sample Café"),
      "tropical",
      framed("sticker", "Pay on delivery"),
    ),
    tile("Donations", upi("Sample Trust"), "bubblegum", official("donate")),
  ],
  paypal: [
    tile(
      "Pay me",
      paypal.generator(),
      "gradientBlue",
      official("scan-to-pay", "Pay with PayPal"),
    ),
    tile(
      "Tip jar",
      paypal.page("business", "local-shop"),
      "butter",
      framed("speech-bubble", "Leave a tip"),
    ),
    tile(
      "Invoice",
      paypal.page("coupon", "member-offer"),
      "minimal",
      framed("banner-bottom", "Pay this invoice"),
    ),
    tile(
      "Fundraiser",
      paypal.page("business", "florist"),
      "harbor",
      official("donate", "Chip in"),
    ),
  ],
  "google-review": [
    tile(
      "Review us",
      review.page("feedback", "guest-feedback"),
      "terracotta",
      official("review-us"),
    ),
    tile(
      "Rate your stay",
      review.page("feedback", "nps-survey"),
      "ice",
      framed("banner-top-bottom", "Loved your stay?", "Leave a review"),
    ),
    tile(
      "Receipt",
      review.generator(),
      "fog",
      framed("ticket", "Rate your visit"),
    ),
    tile(
      "Feedback",
      review.page("business", "local-shop"),
      "royal",
      official("feedback-bubble"),
    ),
  ],
  venmo: [
    tile(
      "Split the bill",
      venmo.generator(),
      "gradientOcean",
      official("scan-to-pay", "Pay with Venmo"),
    ),
    tile(
      "Lemonade stand",
      venmo.page("menu", "juice-bar"),
      "pastelDream",
      framed("sticker", "Pay here"),
    ),
    tile(
      "Club dues",
      venmo.page("feedback", "sign-up"),
      "slate",
      framed("badge", "Club dues"),
    ),
    tile(
      "Tips",
      venmo.page("business", "studio"),
      "candyland",
      framed("speech-bubble", "Tips welcome"),
    ),
  ],
  bitcoin: [
    tile(
      "Checkout",
      bitcoin.generator(),
      "amberMinimal",
      official("scan-to-pay", "Pay with Bitcoin"),
    ),
    tile(
      "Donate",
      bitcoin.page("business", "studio"),
      "gilt",
      official("donate"),
    ),
    tile(
      "Meetup",
      bitcoin.page("event", "conference"),
      "pacman",
      framed("sticker", "Bitcoin accepted"),
    ),
    tile("Wallet", bitcoin.page("business", "local-shop"), "sunset", null),
  ],
  ethereum: [
    tile(
      "Checkout",
      ethereum.generator(),
      "amethystHaze",
      official("scan-to-pay", "Pay with Ethereum"),
    ),
    tile(
      "Event pass",
      ethereum.page("event", "conference"),
      "gradientPurple",
      framed("ticket", "Event pass"),
    ),
    tile(
      "Donate",
      ethereum.page("business", "studio"),
      "lavender",
      official("donate"),
    ),
    tile("Wallet", ethereum.page("business", "local-shop"), "boldTech", null),
  ],
  etsy: [
    tile(
      "Package insert",
      etsy.links("shop"),
      "pastelDream",
      framed("tag", "Thanks for your order"),
    ),
    tile(
      "Shop",
      etsy.page("business", "florist"),
      "sunset",
      official("shop-window", "Visit our Etsy shop"),
    ),
    tile(
      "Craft fair",
      etsy.page("business", "local-shop"),
      "terracotta",
      framed("rounded-border", "Shop online"),
    ),
    tile(
      "Maker",
      etsy.links("creator"),
      "rose",
      framed("polaroid", "Meet the maker"),
    ),
  ],
  dubsh: [
    tile(
      "Campaign",
      dubsh.page("coupon", "store-discount"),
      "electric",
      framed("banner-bottom", "Scan for the offer"),
    ),
    tile(
      "Short link",
      dubsh.generator(),
      "modern",
      framed("rounded-border", "Short link"),
    ),
    tile(
      "Poster",
      dubsh.page("event", "party"),
      "vibrant",
      framed("focus", "Scan here"),
    ),
    tile("Tracked flyer", dubsh.links("minimal"), "slate", null),
  ],
  "google-drive": [
    tile(
      "Shared folder",
      drive.page("custom", "announcement"),
      "mint",
      official("product-info", "Open the files"),
    ),
    tile(
      "Class notes",
      drive.page("feedback", "sign-up"),
      "butter",
      framed("border", "Class notes"),
    ),
    tile(
      "Photo drop",
      drive.links("creator"),
      "gradientOcean",
      framed("polaroid", "Add your photos"),
    ),
    tile("Brief", drive.generator(), "monochrome", null),
  ],
  attendance: [
    tile(
      "Sign-in sheet",
      attendance.page("feedback", "sign-up"),
      "classic",
      official("attendance"),
    ),
    tile(
      "Class check-in",
      attendance.page("event", "webinar"),
      "nature",
      official("check-in"),
    ),
    tile(
      "Workshop",
      attendance.page("event", "conference"),
      "eventTicket",
      framed("ticket", "Sign in here"),
    ),
    tile(
      "Shift start",
      attendance.generator(),
      "fog",
      framed("badge", "Clock in"),
    ),
  ],
  amazon: [
    tile(
      "Product box",
      amazon.page("business", "local-shop"),
      "amberMinimal",
      official("product-info", "See the product"),
    ),
    tile("Sale tag", amazon.page("coupon", "store-discount"), "retailSale"),
    tile(
      "Reorder",
      amazon.links("shop"),
      "sunset",
      framed("sticker", "Reorder"),
    ),
    tile(
      "Registration",
      amazon.generator(),
      "twitter",
      official("register-product"),
    ),
  ],
  flipkart: [
    tile(
      "Shop",
      flipkart.links("shop"),
      "gradientBlue",
      official("shop-window"),
    ),
    tile(
      "Sale",
      flipkart.page("coupon", "store-discount"),
      "spiderman",
      framed("tag", "On sale now"),
    ),
    tile(
      "Product info",
      flipkart.page("business", "local-shop"),
      "butter",
      official("product-info"),
    ),
    tile(
      "Offer",
      flipkart.generator(),
      "retro",
      framed("banner-bottom", "Scan for the offer"),
    ),
  ],
  calcom: [
    tile(
      "Book a call",
      calcom.page("business", "professional"),
      "modern",
      official("book-now"),
    ),
    tile(
      "Office hours",
      calcom.page("event", "webinar"),
      "lavender",
      framed("banner-top-bottom", "Office hours", "Book a slot"),
    ),
    tile(
      "Consultation",
      calcom.generator(),
      "royal",
      framed("ticket", "Book a consult"),
    ),
    tile(
      "Salon",
      calcom.page("business", "studio"),
      "rose",
      framed("speech-bubble", "Book your visit"),
    ),
  ],
};

export const TYPE_CODES: Record<ContentType, PageCode[]> = Object.fromEntries(
  Object.entries<TileSpec[]>(TYPE_TILES).map(([type, tiles]) => [
    type,
    codesFor(`type-${type}`, tiles),
  ]),
) as Record<ContentType, PageCode[]>;
