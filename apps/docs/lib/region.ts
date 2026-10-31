// Display region for prices. Client-safe (no server imports): the pricing page
// passes in the request's headers, cookie and ?currency param.
//
// Display only: each Polar product has a USD and an INR price and Polar picks
// the checkout currency itself, so the region never changes a product id.

import type { PricingCurrency } from "./pricing";

export type Region = "IN" | "default";

export type CurrencyOverride = "usd" | "inr";

/** `?currency=usd|inr` overrides the detected region (and the cookie). */
export const CURRENCY_PARAM = "currency";

/** Remembers a visitor's currency switch. */
export const CURRENCY_COOKIE = "qrdx_currency";

export const CURRENCY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Geo headers set by Vercel and Cloudflare, in order of preference. */
const COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry"] as const;

export function regionForCountry(country: string | null | undefined): Region {
  return country?.trim().toUpperCase() === "IN" ? "IN" : "default";
}

/** "inr" → IN, "usd" → default, anything else → null (no override). */
export function regionForOverride(value: unknown): Region | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  switch (raw.trim().toLowerCase()) {
    case "inr":
      return "IN";
    case "usd":
      return "default";
    default:
      return null;
  }
}

export function currencyForRegion(region: Region): PricingCurrency {
  return region === "IN" ? "INR" : "USD";
}

export function overrideForCurrency(
  currency: PricingCurrency,
): CurrencyOverride {
  return currency === "INR" ? "inr" : "usd";
}

export interface RegionSources {
  /** The `?currency=` search param */
  param?: unknown;
  /** The currency cookie's value */
  cookie?: string | null;
  /** Request headers */
  headers?: Pick<Headers, "get"> | null;
}

/** Override param, then cookie, then geo header; "default" when none match. */
export function resolveRegion({
  param,
  cookie,
  headers,
}: RegionSources): Region {
  const override = regionForOverride(param) ?? regionForOverride(cookie);
  if (override) return override;
  for (const name of COUNTRY_HEADERS) {
    const country = headers?.get(name);
    if (country) return regionForCountry(country);
  }
  return "default";
}
