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
