// How the visit a sign-up happens in started: the referring site's host
// name, the link's campaign tags and `ref` tag, and the first page of the
// visit. Client-safe, no server imports.
//
// Same visit only, like an affiliate's code (lib/affiliates/referral-client.ts):
// it's read on the tab's first page and kept in a variable in this module,
// never in a cookie or browser storage, so a reload or a new tab starts
// over. The sign-in panel sends it with a sign-up (LANDING_HEADER for email
// codes, the OAuth state for Google and GitHub), and the server sanitises
// every field again before recording it with the new account
// (lib/analytics/acquisition.ts). A browser sending Do Not Track or Global
// Privacy Control sends nothing.
//
// What it can't see: an earlier visit. Someone who found QRdx on Google and
// comes back tomorrow by typing the address signs up "direct".
import { hasPrivacySignal, safeString, sanitizePath } from "./privacy";

/** What travels with a sign-up, as sent and as stored (snake_case). */
export interface SignUpLanding {
  /** An external referrer's host name, never its full address */
  referrer_host?: string;
  /** The first page of the visit */
  landing_path?: string;
  /** The page the sign-in panel opened on */
  signup_path?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** A `ref` tag (lib/analytics/handoff-tags.ts, or a campaign's own) */
  ref?: string;
}

const MAX_PATH = 120;
const MAX_HOST = 253;
/** A campaign tag's length, as lib/analytics/privacy.ts allows. */
const MAX_TAG = 64;
/** The encoded header's ceiling: the fields' own caps keep it far below. */
const MAX_HEADER = 2048;

const HOST_NAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const REF_TAG = /^[a-z0-9][a-z0-9_-]{0,31}$/;
/** Printable ASCII only: a pathname as the browser percent-encodes it. */
const PATH = /^\/[\x21-\x7e]*$/;
/** Signed-in areas whose deeper segments can name a workspace or a person. */
const PRIVATE_AREA = /^\/(dashboard|settings|admin|invite|oauth)(?=\/|$)/;

/** A host name, lower-case, or null. */
export function cleanHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  return host.length <= MAX_HOST && HOST_NAME.test(host) ? host : null;
}

/**
 * A page path without its query or fragment, invite ids and signed-in
 * areas' deeper segments, at most 120 characters; or null.
 */
export function cleanPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.split(/[?#]/, 1)[0] ?? "";
  if (!PATH.test(path)) return null;
  const area = PRIVATE_AREA.exec(path);
  const safe = area ? `/${area[1]}` : sanitizePath(path);
  return safe.slice(0, MAX_PATH);
}

/**
 * A campaign tag: short and free of emails, URLs and phone numbers
 * (lib/analytics/privacy.ts), except that a bare host name is kept
 * (utm_source=chatgpt.com names a site, not a person).
 */
export function cleanUtm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const safe = safeString(value);
  if (safe) return safe;
  const trimmed = value.trim();
  return trimmed.length <= MAX_TAG && cleanHost(trimmed) ? trimmed : null;
}

/** A `ref` tag, lower-case, or null. */
export function cleanRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().toLowerCase();
  return REF_TAG.test(tag) ? tag : null;
}

/**
 * The checked copy of a landing object, from the browser or (again) on the
 * server: each field cleaned, unknown keys and bad values dropped. `ownHost`
 * (the site's host) is never a referrer. Null when `raw` isn't an object.
 */
export function cleanLanding(
  raw: unknown,
  ownHost?: string | null,
): SignUpLanding | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const clean: SignUpLanding = {};
  const host = cleanHost(input.referrer_host);
  if (host && !(ownHost && isSameSite(host, ownHost))) {
    clean.referrer_host = host;
  }
  const landing = cleanPath(input.landing_path);
  if (landing) clean.landing_path = landing;
  const signup = cleanPath(input.signup_path);
  if (signup) clean.signup_path = signup;
  for (const key of ["utm_source", "utm_medium"] as const) {
    const tag = cleanUtm(input[key]);
    if (tag) clean[key] = tag.toLowerCase();
  }
  const campaign = cleanUtm(input.utm_campaign);
  if (campaign) clean.utm_campaign = campaign;
  const ref = cleanRef(input.ref);
  if (ref) clean.ref = ref;
  return clean;
}

/** `host` is `site` or one of its subdomains (api.qrdx.dev for qrdx.dev). */
function isSameSite(host: string, site: string): boolean {
  const own = site.toLowerCase().replace(/^www\./, "");
  const bare = host.replace(/^www\./, "");
  return bare === own || bare.endsWith(`.${own}`);
}

/** How the page at `href` was reached, read from its address and referrer. */
export function readLanding(page: {
  href: string;
  referrer: string;
}): SignUpLanding {
  const url = new URL(page.href);
  let referrerHost: string | null = null;
  try {
    referrerHost = page.referrer ? new URL(page.referrer).hostname : null;
  } catch {
    referrerHost = null;
  }
  const params = url.searchParams;
  return (
    cleanLanding(
      {
        referrer_host: referrerHost,
        landing_path: url.pathname,
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
        ref: params.get("ref"),
      },
      url.hostname,
    ) ?? {}
  );
}

// ── This tab's visit ─────────────────────────────────────────────────────────

let captured: SignUpLanding | null = null;
let read = false;

/**
 * Reads the tab's first page, once (later pages of the visit change
 * nothing). Nothing at all under Do Not Track or Global Privacy Control.
 */
export function captureLanding(): void {
  if (read || typeof window === "undefined") return;
  read = true;
  try {
    captured = hasPrivacySignal()
      ? null
      : readLanding({
          href: window.location.href,
          referrer: document.referrer,
        });
  } catch {
    captured = null;
  }
}

/**
 * What a sign-up from this page carries: the visit's start plus the page
 * the sign-in panel is on. Null under Do Not Track or Global Privacy
 * Control.
 */
export function signUpLanding(): SignUpLanding | null {
  if (typeof window === "undefined") return null;
  captureLanding();
  if (!captured) return null;
  const signup = cleanPath(window.location.pathname);
  return { ...captured, ...(signup ? { signup_path: signup } : {}) };
}

/** Forgets the visit (tests). */
export function forgetLanding(): void {
  captured = null;
  read = false;
}

// ── On the wire ──────────────────────────────────────────────────────────────

/** The LANDING_HEADER value: URI-encoded JSON, so it's plain ASCII. */
export function encodeLandingHeader(landing: SignUpLanding): string {
  return encodeURIComponent(JSON.stringify(landing));
}

/** A LANDING_HEADER value read back and cleaned, or null. */
export function decodeLandingHeader(
  value: string | null | undefined,
  ownHost?: string | null,
): SignUpLanding | null {
  if (!value || value.length > MAX_HEADER) return null;
  try {
    return cleanLanding(JSON.parse(decodeURIComponent(value)), ownHost);
  } catch {
    return null;
  }
}
