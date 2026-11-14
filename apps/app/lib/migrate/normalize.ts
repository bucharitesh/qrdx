// Turning provider links into QRdx codes: notes, markers, tags, titles and
// the comparisons used to spot duplicates. Pure and client-safe.

import { type ProviderId, providerName } from "./providers";

const MAX_TITLE = 100;
const MAX_TAG = 32;
const MAX_TAGS = 10;

/** `[import:<provider>:<key>]`, the last line of an imported code's notes. */
const MARKER_PREFIX = "[import:";

export function importMarker(provider: ProviderId, key: string): string {
  // "]" and line breaks would end the marker early.
  return `${MARKER_PREFIX}${provider}:${key.replace(/[\]\r\n]/g, "")}]`;
}

/** Every `[import:provider:key]` in a code's notes, as "provider:key". */
export function parseImportMarkers(notes: string | null | undefined): string[] {
  if (!notes) return [];
  return [...notes.matchAll(/\[import:([a-z0-9-]+):([^\]\r\n]+)\]/g)].map(
    (match) => `${match[1]}:${match[2]}`,
  );
}

/** Prefix for a LIKE that finds every code imported from `provider`. */
export const markerSearchPrefix = (provider: ProviderId) =>
  `${MARKER_PREFIX}${provider}:`;

/** `bit.ly/3AbCdEf` from `https://bit.ly/3AbCdEf`. */
export function displayLink(link: string): string {
  return link.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function isoDay(value: string | Date): string | null {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Notes of an imported code: where it came from, when, the original creation
 * date (QRdx sets its own createdAt) and the marker that makes re-runs skip it.
 */
export function buildImportNotes({
  provider,
  key,
  shortLink,
  createdAt,
  importedAt,
}: {
  provider: ProviderId;
  key: string;
  shortLink: string | null;
  createdAt: string | null;
  importedAt: Date;
}): string {
  const name = providerName(provider);
  const from = shortLink ? ` ${displayLink(shortLink)}` : "";
  const lines = [`Imported from ${name}${from} on ${isoDay(importedAt)}.`];
  const created = createdAt ? isoDay(createdAt) : null;
  if (created) lines.push(`Created in ${name} on ${created}.`);
  lines.push(importMarker(provider, key));
  return lines.join("\n");
}

/** Host and back-half of a short link; null parts when it doesn't parse. */
export function splitShortLink(link: string | null | undefined): {
  domain: string | null;
  backHalf: string | null;
} {
  if (!link) return { domain: null, backHalf: null };
  try {
    const url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    const path = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
    return {
      domain: url.hostname.toLowerCase() || null,
      backHalf: path || null,
    };
  } catch {
    return { domain: null, backHalf: null };
  }
}

/** A full https URL for a short link given with or without its scheme. */
export function absoluteShortLink(link: string | null | undefined) {
  const value = link?.trim();
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * Comparison key for destinations: URL.href (what QRdx stores) without a
 * trailing slash on the path, so "https://a.com" and "https://a.com/" match.
 */
export function destinationKey(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const href = url.href;
    return url.search || url.hash ? href : href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Both spellings a stored destination may have (with and without "/"). */
export function destinationVariants(value: string): string[] {
  const key = destinationKey(value);
  if (!key) return [];
  return key.endsWith("/") ? [key] : [key, `${key}/`];
}

export function cleanTitle(value: string | null | undefined): string | null {
  const title = value?.replace(/\s+/g, " ").trim();
  if (!title) return null;
  return title.length > MAX_TITLE
    ? `${title.slice(0, MAX_TITLE - 1).trimEnd()}…`
    : title;
}

/** Tags QRdx can hold: trimmed, ≤ 32 characters, unique, at most 10. */
export function cleanTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAG).trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length === MAX_TAGS) break;
  }
  return result;
}

/** Splits "a; b, c | d" tag cells from export files. */
export function splitTagCell(value: string): string[] {
  return value
    .split(/[;,|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}
