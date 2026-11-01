import { baseUrl } from "@/lib/metadata";

/**
 * Easter eggs: the site's decorative QR codes (404, footer, home demos…) are
 * real codes for https://qrdx.dev/m/<slug>, and app/m/[slug] redirects each
 * slug to its destination here. Swap a destination here, never in a code,
 * so codes (precomputed or screenshotted) never change.
 *
 * Destinations must be stable, brand-safe pages: official YouTube uploads
 * (checked with YouTube oEmbed), Know Your Meme for image memes, Giphy for
 * GIF-first ones. Slugs name the place, not the punchline, so a scanner's
 * URL preview doesn't spoil it. Precomputed matrices cap slug length: 7
 * characters for 25 × 25 (version 2-M), 5 for 29 × 29 (version 3-H).
 */
export interface EasterEgg {
  /** The meme. */
  title: string;
  /** Where the code lands. */
  url: string;
  /** Why it fits the place. */
  why: string;
}

// Each destination is the media itself, not a page about it: the image or
// GIF file, or YouTube's player-only embed for videos.
export const easterEggs = {
  lost: {
    title: "Confused Travolta",
    url: "https://i.giphy.com/hEc4k5pN17GZq.webp",
    why: "404 page: looking around for a page that isn't there.",
  },
  oops: {
    title: "This is fine",
    url: "https://i.imgflip.com/wxica.jpg",
    why: "Error page: something is on fire, we're calmly on it.",
  },
  footer: {
    title: "Never Gonna Give You Up",
    url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1",
    why: "Footer code mosaic: the classic QR prank, for whoever scans to the very end.",
  },
  hero: {
    title: "Stonks",
    url: "https://i.kym-cdn.com/entries/icons/original/000/029/959/Screen_Shot_2019-06-05_at_1.26.32_PM.jpg",
    why: "Home hero card: stands under the scan chart, and scans only go up.",
  },
  score: {
    title: "Is this a pigeon?",
    url: "https://i.imgflip.com/1o00in.jpg",
    why: "Scan-score demo: lighten the ink until the scanner asks 'is this a QR code?'.",
  },
  print: {
    title: "What is this? A center for ants?",
    url: "https://www.youtube-nocookie.com/embed/LQc8NDKcnpM?autoplay=1",
    why: "Print-size demo: a code printed too small for its scanning distance.",
  },
  menu: {
    title: "They're the same picture",
    url: "https://i.imgflip.com/2za3u1.jpg",
    why: "Dynamic-codes demo: three destinations, one printed code. Spot the difference.",
  },
  studio: {
    title: "Bob Ross: Happy Accident",
    url: "https://www.youtube-nocookie.com/embed/Fw6odlNp7_8?autoplay=1",
    why: "Style studio demo: no mistakes when styling a code, just happy accidents.",
  },
  mcp: {
    title: "I know Kung Fu",
    url: "https://www.youtube-nocookie.com/embed/8XV8aBNOIqI?autoplay=1",
    why: "MCP mockup: the assistant downloads a new skill (QR codes) and just knows it.",
  },
  pro: {
    title: "Shut up and take my money",
    url: "https://imgflip.com/s/meme/Shut-Up-And-Take-My-Money-Fry.jpg",
    why: "Upgrade dialog: the code beside the Pro pitch says it for you.",
  },
  smudge: {
    title: "'Tis but a scratch",
    url: "https://www.youtube-nocookie.com/embed/Apt9HIg2wEU?autoplay=1",
    why: "Error-correction demo on the blog: smudge the code and it shrugs it off.",
  },
} as const satisfies Record<string, EasterEgg>;

export type EasterEggSlug = keyof typeof easterEggs;

/** The egg for a slug, or null (own keys only, so "constructor" isn't one). */
export function getEasterEgg(slug: string): EasterEgg | null {
  const key = slug.toLowerCase();
  return Object.hasOwn(easterEggs, key)
    ? easterEggs[key as EasterEggSlug]
    : null;
}

/**
 * What a decorative code rendered at runtime encodes: the dev server locally
 * (like baseUrl), https://qrdx.dev everywhere else. Precomputed matrices
 * (components/fx/qr-matrix.ts) always encode the production URL.
 */
export function easterEggUrl(slug: EasterEggSlug): string {
  const origin =
    process.env.NODE_ENV === "development" ? baseUrl : "https://qrdx.dev";
  return new URL(`/m/${slug}`, origin).toString();
}
