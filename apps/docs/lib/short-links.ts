import { baseUrl } from "./metadata";

/** Default short links are `${SHORT_LINK_BASE}/q/<slug>`. */
export const SHORT_LINK_BASE = (() => {
  // Validated as a URL by lib/env.ts; only its origin is used.
  const override = process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL;
  return override ? new URL(override).origin : baseUrl.origin;
})();

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const SLUG_LENGTH = 7;
const SLUG_PATTERN = /^[0-9A-Za-z]{7}$/;

/**
 * Never issued as slugs: they would read as site or system paths on a custom
 * domain (`https://<host>/<slug>`). Compared case-insensitively.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  ".well-known",
  "_next",
  "about",
  "account",
  "admin",
  "ai",
  "api",
  "app",
  "assets",
  "auth",
  "billing",
  "blog",
  "callback",
  "contact",
  "dashboard",
  "docs",
  "domains",
  "favicon.ico",
  "help",
  "index",
  "invite",
  "legal",
  "llms.txt",
  "login",
  "logout",
  "manifest.json",
  "null",
  "oauth",
  "pricing",
  "privacy",
  "q",
  "qr",
  "r",
  "robots.txt",
  "settings",
  "sign-in",
  "sign-out",
  "sign-up",
  "signin",
  "signout",
  "signup",
  "sitemap.xml",
  "static",
  "status",
  "support",
  "team",
  "terms",
  "tools",
  "undefined",
  "www",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/** Shape check before a database lookup (7 base62 characters). */
export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !isReservedSlug(slug);
}

/**
 * Random 7-character base62 slug from the Web Crypto CSPRNG (~3.5e12 values).
 * Uniqueness is enforced by the database: retry on a unique-violation.
 */
export function generateSlug(): string {
  let slug = "";
  while (slug.length < SLUG_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(SLUG_LENGTH))) {
      // 248 = 62 * 4: skipping larger bytes keeps every character equally likely.
      if (byte < 248 && slug.length < SLUG_LENGTH) {
        slug += BASE62[byte % 62];
      }
    }
    if (slug.length === SLUG_LENGTH && isReservedSlug(slug)) {
      slug = "";
    }
  }
  return slug;
}

/** Public URL of a code: the custom domain root when bound, else `/q/<slug>`. */
export function shortLinkUrl(slug: string, hostname?: string | null): string {
  const path = encodeURIComponent(slug);
  return hostname
    ? `https://${hostname}/${path}`
    : `${SHORT_LINK_BASE}/q/${path}`;
}
