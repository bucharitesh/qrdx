// Where a request comes from, roughly, from the hosting platform's headers.
// Pure (no server imports): scans (./scans.ts), the security emails
// (./security/request-details.ts) and the session check
// (./account/session-origin.ts) share it.

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

/**
 * Approximate place from the hosting platform's geo headers, with a CDN's
 * country header as the fallback. Absent when self-hosted or local.
 */
export function scanGeo(headers: Headers): {
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const country = (
    headerText(headers, "x-vercel-ip-country", 8) ??
    headerText(headers, "cf-ipcountry", 8)
  )?.toUpperCase();
  return {
    // "XX" = unknown
    country:
      country && country !== "XX" && /^[A-Z]{2}$/.test(country)
        ? country
        : null,
    region: headerText(headers, "x-vercel-ip-country-region", 16),
    city: headerText(headers, "x-vercel-ip-city", 100),
  };
}
