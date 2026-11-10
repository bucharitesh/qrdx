// The brands the logo gallery shows first, by what people put on a code:
// where to follow, message, pay, find, listen, watch, download and review.
// Every slug is checked against simple-icons (tests/brand-logos).
//
// Some brands asked Simple Icons to remove their marks (LinkedIn, Amazon,
// Slack, Microsoft and others); they aren't offered, and don't get added
// back from anywhere else.

export interface BrandGroup {
  id: string;
  label: string;
  slugs: readonly string[];
}

export const POPULAR_BRAND_GROUPS: readonly BrandGroup[] = [
  {
    id: "social",
    label: "Social",
    slugs: [
      "instagram",
      "facebook",
      "tiktok",
      "x",
      "threads",
      "snapchat",
      "pinterest",
      "reddit",
      "bluesky",
      "mastodon",
      "tumblr",
      "github",
    ],
  },
  {
    id: "messaging",
    label: "Messaging",
    slugs: [
      "whatsapp",
      "messenger",
      "telegram",
      "signal",
      "wechat",
      "line",
      "viber",
      "discord",
      "kakaotalk",
      "zalo",
    ],
  },
  {
    id: "payments",
    label: "Payments",
    slugs: [
      "paypal",
      "venmo",
      "cashapp",
      "stripe",
      "applepay",
      "googlepay",
      "revolut",
      "wise",
      "klarna",
      "alipay",
      "bitcoin",
      "ethereum",
    ],
  },
  {
    id: "maps",
    label: "Maps and travel",
    slugs: ["googlemaps", "waze", "openstreetmap", "uber", "airbnb"],
  },
  {
    id: "music",
    label: "Music and podcasts",
    slugs: [
      "spotify",
      "applemusic",
      "youtubemusic",
      "soundcloud",
      "deezer",
      "tidal",
      "shazam",
      "bandcamp",
      "applepodcasts",
      "pocketcasts",
    ],
  },
  {
    id: "video",
    label: "Video",
    slugs: ["youtube", "netflix", "vimeo", "twitch", "kick", "zoom"],
  },
  {
    id: "stores",
    label: "App stores",
    slugs: ["appstore", "googleplay", "apple", "android"],
  },
  {
    id: "reviews",
    label: "Reviews",
    slugs: ["google", "tripadvisor", "trustpilot", "yelp", "producthunt"],
  },
];

/** Every popular slug, in gallery order. */
export const POPULAR_BRAND_SLUGS: readonly string[] =
  POPULAR_BRAND_GROUPS.flatMap((group) => group.slugs);
