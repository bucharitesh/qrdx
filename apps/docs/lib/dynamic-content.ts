// Which content types a dynamic code can open. A dynamic code encodes a short
// link that redirects, so only content whose payload is a web address can
// sit behind one: a WhatsApp chat (wa.me), a place (google.com/maps), a
// profile, a shop. Wi-Fi, contacts, texts, emails, calls and payment URIs are
// written into the code itself and stay static. Each list is checked against
// the encoders in tests/lib/dynamic-content.test.ts, so a new content type
// has to be placed in one of them.

import { validateDesignContent } from "@/lib/qr-design/content";
import type { ContentType } from "@/types/qr-content";
import { normalizeWebUrl } from "@/utils/qr-content-encoder";

/** Types whose payload is a web address, in the builder's order. */
export const DYNAMIC_CONTENT_TYPES = [
  "url",
  "whatsapp",
  "maps",
  "google-review",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "linkedin",
  "twitter",
  "threads",
  "pinterest",
  "snapchat",
  "reddit",
  "spotify",
  "calcom",
  "attendance",
  "google-drive",
  "paypal",
  "venmo",
  "etsy",
  "amazon",
  "flipkart",
] as const satisfies readonly ContentType[];

export type DynamicContentType = (typeof DYNAMIC_CONTENT_TYPES)[number];

/** Types the "More types" list offers (a website link has its own choice). */
export type OtherDynamicType = Exclude<DynamicContentType, "url">;

export const OTHER_DYNAMIC_TYPES = DYNAMIC_CONTENT_TYPES.filter(
  (type): type is OtherDynamicType => type !== "url",
);

/** What these hold is written into the pattern; no redirect can carry it. */
export const STATIC_ONLY_TYPES = [
  "wifi",
  "vcard",
  "text",
  "email",
  "phone",
  "sms",
  "upi",
  "bitcoin",
  "ethereum",
] as const satisfies readonly ContentType[];

/**
 * Web addresses, but not offered: a Dub link is already a short link with
 * its own analytics, so another short link in front of it adds nothing.
 */
export const NOT_OFFERED_DYNAMIC_TYPES = [
  "dubsh",
] as const satisfies readonly ContentType[];

const DYNAMIC = new Set<string>(DYNAMIC_CONTENT_TYPES);

export function isDynamicContentType(
  type: string | null | undefined,
): type is DynamicContentType {
  return typeof type === "string" && DYNAMIC.has(type);
}

export interface ContentIssue {
  /** The field the problem is in; none = the content as a whole */
  field?: string;
  message: string;
}

export type DynamicDestinationResult =
  | { ok: true; url: string }
  | { ok: false; issues: ContentIssue[] };

/**
 * The web address a dynamic code of this type opens, from its form's fields:
 * checked with the same schemas and encoder the playground uses, then
 * required to be http(s) (a spotify: link, say, can't be redirected to).
 */
export function dynamicDestination(
  type: DynamicContentType,
  fields: Record<string, string>,
): DynamicDestinationResult {
  const result = validateDesignContent({ type, ...fields });
  if (!result.ok) return { ok: false, issues: result.issues };
  const url = normalizeWebUrl(result.value);
  let protocol = "";
  try {
    protocol = new URL(url).protocol;
  } catch {
    // Not a URL at all: reported below.
  }
  if (protocol !== "https:" && protocol !== "http:") {
    return {
      ok: false,
      issues: [
        {
          message:
            type === "spotify"
              ? "Use an open.spotify.com link. A spotify: link can't sit behind a short link."
              : "This doesn't make a web address, so it can't be a dynamic code.",
        },
      ],
    };
  }
  return { ok: true, url };
}
