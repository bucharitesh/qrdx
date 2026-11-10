// What the builder checks as you type, and where a server error belongs.
// The server (app/(app)/dashboard/codes/_lib/qr-codes.ts, server-only) stays the
// authority; these mirror its rules and messages so the form can say the
// same thing before you press Create.

import type { QrCodeErrorCode } from "@/actions/qr-codes";
import { baseUrl } from "@/lib/metadata";
import { withoutImageFills } from "@/lib/paint/image-fills";
import { SHORT_LINK_BASE } from "@/lib/short-links";
import type { QRStyle } from "@/types/theme";
import type { BuilderFields } from "./types";

/** Mirrors MAX_DESTINATION_LENGTH and MAX_TITLE_LENGTH on the server. */
export const MAX_DESTINATION_LENGTH = 2048;
export const MAX_TITLE_LENGTH = 100;

const OWN_HOSTS = new Set([new URL(SHORT_LINK_BASE).host, baseUrl.host]);

export type DestinationCheck =
  | { ok: true; url: string }
  | { ok: false; message: string };

/**
 * A destination as typed, checked like the server checks it. https:// is
 * assumed when the scheme is missing, as browsers do.
 */
export function checkDestination(raw: string): DestinationCheck {
  const value = raw.trim();
  if (!value) return { ok: false, message: "Enter a destination URL" };
  if (value.length > MAX_DESTINATION_LENGTH) {
    return { ok: false, message: "The destination URL is too long" };
  }
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  let url: URL;
  try {
    url = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    return { ok: false, message: "Enter a full URL, starting with https://" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      message: "Only http:// and https:// links can be used",
    };
  }
  if (!url.hostname) {
    return { ok: false, message: "Enter a full URL, starting with https://" };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      message: "Links with a username or password are not allowed",
    };
  }
  if (OWN_HOSTS.has(url.host) && /^\/q\//i.test(url.pathname)) {
    return {
      ok: false,
      message: "A dynamic code cannot point to another QRdx short link",
    };
  }
  if (url.href.length > MAX_DESTINATION_LENGTH) {
    return { ok: false, message: "The destination URL is too long" };
  }
  return { ok: true, url: url.href };
}

/** Where a field's error shows; "form" is the banner above the footer. */
export type BuilderErrorField = "destination" | "slug" | "domain" | "form";

/**
 * The field a server error belongs to. QRdx actions return typed codes
 * (QrCodeErrorCode), so this needs no keyword guessing for most of them.
 */
export function fieldForError(error: {
  code: string;
  message: string;
}): BuilderErrorField {
  switch (error.code as QrCodeErrorCode) {
    case "INVALID_SLUG":
    case "SLUG_TAKEN":
      return "slug";
    case "UNSAFE_DESTINATION":
      return "destination";
    case "DOMAIN_NOT_VERIFIED":
      return "domain";
    case "VALIDATION_ERROR":
      // zod's first issue: the destination schema speaks of URLs and links.
      if (/\b(url|link|destination|https?)\b/i.test(error.message)) {
        return "destination";
      }
      if (/back-half/i.test(error.message)) return "slug";
      return "form";
    default:
      return "form";
  }
}

/** The plan is what's in the way: the banner offers the upgrade dialog. */
export function needsUpgrade(code: string): boolean {
  return code === "LIMIT_REACHED" || code === "PLAN_REQUIRED";
}

const sortedTags = (ids: string[]) => [...ids].sort();

/** Same fields, the same tags in any order, the same design. */
export function fieldsEqual(a: BuilderFields, b: BuilderFields): boolean {
  return (
    a.destination.trim() === b.destination.trim() &&
    a.title.trim() === b.title.trim() &&
    a.domainId === b.domainId &&
    a.slug.trim() === b.slug.trim() &&
    a.folderId === b.folderId &&
    JSON.stringify(sortedTags(a.tagIds)) ===
      JSON.stringify(sortedTags(b.tagIds)) &&
    JSON.stringify(a.style) === JSON.stringify(b.style)
  );
}

export interface FieldChanges {
  destination: boolean;
  title: boolean;
  domain: boolean;
  slug: boolean;
  folder: boolean;
  tags: boolean;
  style: boolean;
}

/** Which fields an edit changed, so a save sends only those. */
export function changedFields(
  initial: BuilderFields,
  current: BuilderFields,
): FieldChanges {
  const slug = current.slug.trim();
  return {
    destination: current.destination.trim() !== initial.destination.trim(),
    title: current.title.trim() !== initial.title.trim(),
    domain: current.domainId !== initial.domainId,
    // Editing: an empty back-half keeps the current one.
    slug: Boolean(slug) && slug !== initial.slug.trim(),
    folder: current.folderId !== initial.folderId,
    tags:
      JSON.stringify(sortedTags(current.tagIds)) !==
      JSON.stringify(sortedTags(initial.tagIds)),
    style:
      current.style !== null &&
      JSON.stringify(current.style) !== JSON.stringify(initial.style),
  };
}

/**
 * Server actions accept up to 1MB, so a very large inline logo is left out
 * of the saved design (the playground's "Make it dynamic" does the same).
 */
export const MAX_SAVED_STYLE_LENGTH = 900_000;

export function fitStyleForSave(style: QRStyle): {
  style: QRStyle;
  trimmed: boolean;
} {
  if (JSON.stringify(style).length <= MAX_SAVED_STYLE_LENGTH) {
    return { style, trimmed: false };
  }
  const { customLogo: _logo, ...rest } = style;
  if (JSON.stringify(rest).length <= MAX_SAVED_STYLE_LENGTH) {
    return { style: rest, trimmed: true };
  }
  // Still too large: image fills give way to their underlay colors too
  return { style: withoutImageFills(rest), trimmed: true };
}
