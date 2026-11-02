import { baseUrl } from "./metadata";

/** Default short links are `${SHORT_LINK_BASE}/q/<slug>`. */
export const SHORT_LINK_BASE = (() => {
  // Validated as a URL by lib/env.ts; only its origin is used.
  const override = process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL;
  return override ? new URL(override).origin : baseUrl.origin;
})();

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const SLUG_LENGTH = 7;
const GENERATED_SLUG_PATTERN = /^[0-9A-Za-z]{7}$/;

// ─── Custom back-halves ──────────────────────────────────────────────────────
// Pro and Business can choose a code's back-half (`qrdx.dev/q/spring-menu`,
// `go.brand.com/spring-menu`). Slugs are case-sensitive, like generated ones:
// `Spring-Menu` and `spring-menu` are two links. Reserved words are compared
// case-insensitively.

export const CUSTOM_SLUG_MIN = 3;
export const CUSTOM_SLUG_MAX = 64;
const CUSTOM_SLUG_CHARS = /^[A-Za-z0-9_-]+$/;

/**
 * The namespace of a slug (qr_code.slug_scope). Generated slugs and back-halves
 * chosen on the default short link live in the shared one (`qrdx.dev/q/<slug>`,
 * unique across QRdx); a back-half chosen on a custom domain lives in that
 * domain's own (its id), so it only has to be unique there.
 */
export const SHARED_SLUG_SCOPE = "";

/**
 * Never issued on the shared short domain: they would read as site or system
 * paths (`qrdx.dev/q/admin`, `go.brand.com/login`) or impersonate QRdx.
 * Generated slugs skip them too. Compared case-insensitively.
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
  "changelog",
  "changelogs",
  "community",
  "compare",
  "contact",
  "dashboard",
  "docs",
  "domains",
  "editor",
  "favicon.ico",
  "guarantee",
  "help",
  "index",
  "integrations",
  "invite",
  "legal",
  "llms",
  "llms.txt",
  "login",
  "logout",
  "m",
  "manifest.json",
  "mcp",
  "null",
  "oauth",
  "og",
  "p",
  "playground",
  "plugins",
  "pricing",
  "privacy",
  "q",
  "qr",
  "qrdx",
  "r",
  "report-abuse",
  "robots.txt",
  "scan",
  "security",
  "settings",
  "sign-in",
  "sign-out",
  "sign-up",
  "signin",
  "signout",
  "signup",
  "sitemap",
  "sitemap.xml",
  "static",
  "status",
  "success",
  "support",
  "team",
  "templates",
  "terms",
  "tools",
  "undefined",
  "v1",
  "verify",
  "www",
]);

/**
 * Never issued on a customer's own domain: paths that domain already serves
 * (`/api/...`, `/p/<slug>`) or that read as broken links. A domain's other
 * paths are its owner's to name (`go.brand.com/pricing` is fine there).
 */
export const DOMAIN_RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "_next",
  "api",
  "null",
  "p",
  "q",
  "undefined",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

/** Generated shape: exactly 7 letters or digits (and not a reserved word). */
export function isGeneratedSlug(slug: string): boolean {
  return GENERATED_SLUG_PATTERN.test(slug) && !isReservedSlug(slug);
}

/** 3–64 letters, digits, `-` or `_`, not starting or ending with `-`. */
function isCustomSlugShape(slug: string): boolean {
  return (
    slug.length >= CUSTOM_SLUG_MIN &&
    slug.length <= CUSTOM_SLUG_MAX &&
    CUSTOM_SLUG_CHARS.test(slug) &&
    !slug.startsWith("-") &&
    !slug.endsWith("-")
  );
}

/**
 * Shape check before a database lookup: a generated slug or a custom
 * back-half. Reserved words aren't rejected here (a custom domain may use
 * `pricing`); they simply never exist on the shared domain.
 */
export function isValidSlug(slug: string): boolean {
  return GENERATED_SLUG_PATTERN.test(slug) || isCustomSlugShape(slug);
}

export type SlugProblem = "length" | "characters" | "dash" | "reserved";

/**
 * Why a back-half can't be chosen, before checking availability. On a custom
 * domain only that domain's own paths are reserved.
 */
export function slugProblem(
  slug: string,
  { onCustomDomain }: { onCustomDomain: boolean },
): SlugProblem | null {
  if (slug.length < CUSTOM_SLUG_MIN || slug.length > CUSTOM_SLUG_MAX) {
    return "length";
  }
  if (!CUSTOM_SLUG_CHARS.test(slug)) return "characters";
  if (slug.startsWith("-") || slug.endsWith("-")) return "dash";
  const reserved = onCustomDomain ? DOMAIN_RESERVED_SLUGS : RESERVED_SLUGS;
  return reserved.has(slug.toLowerCase()) ? "reserved" : null;
}

export const SLUG_PROBLEM_MESSAGES: Record<SlugProblem, string> = {
  length: `Use ${CUSTOM_SLUG_MIN} to ${CUSTOM_SLUG_MAX} characters.`,
  characters: "Use only letters, digits, - and _.",
  dash: "A back-half can't start or end with a dash.",
  reserved: "This back-half is reserved. Try another one.",
};

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

/**
 * The links of a code. `defaultLink` (`qrdx.dev/q/<slug>`) works for every
 * slug in the shared namespace, also after the code moves to a custom domain;
 * a back-half that belongs to a custom domain has none. `link` is the one to
 * encode: the custom domain's once it's verified (or always, for a back-half
 * of that domain, which goes live when the domain does).
 */
export function codeLinks(
  code: { slug: string; slugScope: string },
  domain: { hostname: string; verified: boolean } | null,
): { link: string; defaultLink: string | null } {
  const domainScoped = code.slugScope !== SHARED_SLUG_SCOPE;
  const defaultLink = domainScoped ? null : shortLinkUrl(code.slug);
  const onDomain = domain && (domain.verified || domainScoped);
  return {
    link: onDomain
      ? shortLinkUrl(code.slug, domain.hostname)
      : (defaultLink ?? shortLinkUrl(code.slug)),
    defaultLink,
  };
}
