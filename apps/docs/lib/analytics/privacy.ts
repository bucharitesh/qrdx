import { isUntrackedPath } from "@/components/landing/customer-page-paths";
import type { CleanProps } from "./events";

/**
 * PII guards shared by every analytics destination. Event properties are
 * typed to ids and coarse values already; this is the runtime backstop for
 * anything that slips through (a renamed variable, a value from an API).
 */

/** Keys that name personal or user-written data, whatever their value. */
const BLOCKED_KEY =
  /(^|_)(e?mail|name|first_name|last_name|full_name|phone|address|url|uri|href|link|destination|target_url|value|content|text|query|search|prompt|message|stack|password|token|secret|ip)$/;

const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const URL_LIKE =
  /(^[a-z][a-z\d+.-]*:\/?\/?\S)|(^www\.)|(\.[a-z]{2,}\/)|(^([a-z\d-]+\.)+[a-z]{2,}$)/i;
const PHONE_LIKE = /^\+?[\d\s().-]{7,}$/;
const MAX_STRING = 64;

function safeString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_STRING) return null;
  if (EMAIL_LIKE.test(trimmed) || URL_LIKE.test(trimmed)) return null;
  if (PHONE_LIKE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Flat, PII-free copy of event properties: snake_case keys only, no keys
 * that name personal data, strings short and free of emails, URLs and phone
 * numbers, finite numbers, booleans. Everything else is dropped.
 */
export function sanitizeProps(props: object | undefined | null): CleanProps {
  const clean: CleanProps = {};
  if (!props) return clean;
  for (const [key, value] of Object.entries(props)) {
    if (!/^[a-z\d][a-z\d_]{0,39}$/.test(key)) continue;
    // `content_type` and `query_length` describe data; `theme_name` holds it.
    if (BLOCKED_KEY.test(key)) continue;
    if (typeof value === "boolean") clean[key] = value;
    else if (typeof value === "number") {
      if (Number.isFinite(value)) clean[key] = value;
    } else if (typeof value === "string") {
      const safe = safeString(value);
      if (safe !== null) clean[key] = safe;
    }
  }
  return clean;
}

/** Query parameters worth keeping on page URLs: campaign attribution only. */
const KEPT_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
]);

/** Path segments that act as secrets or identify a person. */
const REDACTED_PATHS: [RegExp, string][] = [
  [/^\/invite\/[^/]+/, "/invite/:id"],
];

export function sanitizePath(pathname: string): string {
  let path = pathname || "/";
  for (const [pattern, replacement] of REDACTED_PATHS) {
    path = path.replace(pattern, replacement);
  }
  return path;
}

/**
 * A page URL without secrets: origin and path (sensitive segments
 * redacted), campaign parameters only, no hash. OAuth requests, checkout
 * ids and playground state never leave the browser.
 */
export function sanitizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return raw;
    const params = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
      if (KEPT_PARAMS.has(key)) {
        const safe = safeString(value);
        if (safe !== null) params.set(key, safe);
      }
    }
    const search = params.toString();
    return `${url.origin}${sanitizePath(url.pathname)}${search ? `?${search}` : ""}`;
  } catch {
    // "$direct" and other non-URL markers pass through unchanged.
    return raw;
  }
}

/** Areas whose page titles can show a code, page or person's name. */
const PRIVATE_AREAS =
  /^\/(dashboard|settings|admin|invite|oauth|playground)(\/|$)/;

/** The document title, or nothing for signed-in areas that show user data. */
export function safeTitle(pathname: string, title: string): string {
  return PRIVATE_AREAS.test(pathname) ? "" : title;
}

/**
 * Paths where QRdx records nothing at all: customer-facing pages and the
 * scanner (see customer-page-paths.ts), plus the admin panel.
 */
export function isUntrackedAnalyticsPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    isUntrackedPath(pathname) ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

/** Do Not Track or Global Privacy Control is on in this browser. */
export function hasPrivacySignal(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    globalPrivacyControl?: boolean;
    msDoNotTrack?: string;
  };
  const win =
    typeof window === "undefined"
      ? undefined
      : (window as Window & { doNotTrack?: string });
  if (nav.globalPrivacyControl === true) return true;
  const dnt = nav.doNotTrack ?? win?.doNotTrack ?? nav.msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}
