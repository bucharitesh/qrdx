// Where a request comes from, roughly, from the hosting platform's headers.
// Pure (no server imports): scans (./scans.ts), the security emails
// (./security/request-details.ts) and the session check
// (./account/session-origin.ts) share it.
//
// Only the platform's own headers count. Each platform sets its headers and
// replaces any a client sent, but passes the other platform's through: behind
// Cloudflare a client could send Vercel's country header (and the reverse),
// to pick or blank its country for the stolen-session check. So on Vercel
// (VERCEL is set on its servers) only Vercel's headers are read; anywhere
// else only Cloudflare's country, and no region or city.

function headerText(
  headers: Headers,
  name: string,
  maxLength: number,
): string | null {
  const raw = headers.get(name);
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // Keep the raw value when it is not percent-encoded.
  }
  return value.trim().slice(0, maxLength) || null;
}

/** Whose geo headers to trust: the platform this server runs on. */
export type GeoPlatform = "vercel" | "cloudflare";

export const geoPlatform = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): GeoPlatform => (env.VERCEL ? "vercel" : "cloudflare");

/**
 * Approximate place from the platform's geo headers (geoPlatform): on
 * Vercel its country, region and city; elsewhere Cloudflare's country.
 * Absent when self-hosted without either, or local.
 */
export function scanGeo(
  headers: Headers,
  platform: GeoPlatform = geoPlatform(),
): {
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const onVercel = platform === "vercel";
  const country = headerText(
    headers,
    onVercel ? "x-vercel-ip-country" : "cf-ipcountry",
    8,
  )?.toUpperCase();
  return {
    // "XX" = unknown
    country:
      country && country !== "XX" && /^[A-Z]{2}$/.test(country)
        ? country
        : null,
    region: onVercel
      ? headerText(headers, "x-vercel-ip-country-region", 16)
      : null,
    city: onVercel ? headerText(headers, "x-vercel-ip-city", 100) : null,
  };
}

// ── Network coordinates (geofence routing, lib/scan-location) ──

const COORDINATE = /^[-+]?\d{1,3}(?:\.\d{1,8})?$/;

/**
 * The approximate coordinates of the request's IP address: Vercel's
 * x-vercel-ip-latitude and x-vercel-ip-longitude (usually the center of the
 * city or area the IP is registered to). Null elsewhere (Cloudflare's
 * coordinates aren't trusted, as above), locally, or when missing. Used for
 * geofence rules when a scanner didn't share a precise location; never
 * stored.
 */
export function networkCoordinates(
  headers: Headers,
  platform: GeoPlatform = geoPlatform(),
): { latitude: number; longitude: number } | null {
  if (platform !== "vercel") return null;
  const lat = headerText(headers, "x-vercel-ip-latitude", 16);
  const lng = headerText(headers, "x-vercel-ip-longitude", 16);
  if (!(lat && lng && COORDINATE.test(lat) && COORDINATE.test(lng))) {
    return null;
  }
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (
    !(Number.isFinite(latitude) && Number.isFinite(longitude)) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}
