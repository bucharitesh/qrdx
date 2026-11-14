import { CANONICAL_ORIGIN } from "@repo/config";

// App-only constants. Limits that more than one part of QRdx enforces or
// quotes (uploads, AI caps, themes, batches) live in @repo/config.

export const DEBOUNCE_DELAY = 50;

// Logo shown when "Show logo" is on but no custom logo was uploaded.
export const DEFAULT_QR_LOGO = `${CANONICAL_ORIGIN}/logo.png`;

export const COMMUNITY_THEMES_PAGE_SIZE = 20;

export const COMMUNITY_THEME_TAGS = [
  "colorful",
  "minimal",
  "professional",
  "playful",
  "warm",
  "cool",
  "high-contrast",
  "pastel",
  "earthy",
  "neon",
  "retro",
  "futuristic",
  "nature",
  "monochrome",
  "vibrant",
  "elegant",
  "bold",
  "soft",
  "gradient",
  "flat",
  "glassmorphism",
  "neumorphism",
  "brutalist",
  "corporate",
  "startup",
  "dashboard",
  "e-commerce",
  "portfolio",
  "blog",
  "saas",
  "landing-page",
  "ocean",
  "sunset",
  "forest",
  "candy",
  "midnight",
  "nordic",
  "tropical",
  "autumn",
  "winter",
  "spring",
  "cyberpunk",
  "vintage",
  "art-deco",
  "industrial",
  "zen",
  "accessible",
  "romantic",
  "geometric",
] as const;

export const OAUTH_ACCESS_TOKEN_EXPIRY_SECONDS = 60 * 60; // 1 hour
export const OAUTH_REFRESH_TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const OAUTH_AUTHORIZATION_CODE_EXPIRY_SECONDS = 60 * 10; // 10 minutes
