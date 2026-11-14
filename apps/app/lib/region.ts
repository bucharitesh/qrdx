// Display region for prices. Client-safe (no server imports): the pricing page
// passes in the request's headers, cookie and ?currency param.
//
// The display can be switched (?currency=, the cookie), but checkout always
// charges the currency of the visitor's country (checkoutCurrency), which is
// also what the page shows when nothing is switched.

import {
  currencyForCountry,
  EUR_PRICES,
  type PricingCurrency,
} from "./pricing";

export type Region = "IN" | "EU" | "default";

export type CurrencyOverride = "usd" | "inr" | "eur";

/** `?currency=usd|inr|eur` overrides the detected region (and the cookie). */
export const CURRENCY_PARAM = "currency";

/** Remembers a visitor's currency switch. */
export const CURRENCY_COOKIE = "qrdx_currency";

export const CURRENCY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Geo headers set by Vercel and Cloudflare, in order of preference. */
const COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry"] as const;

/** Whether euro prices are on; tests pass it, everything else uses EUR_PRICES. */
interface EurOption {
  eur?: boolean;
}

export function regionForCurrency(currency: PricingCurrency): Region {
  if (currency === "INR") return "IN";
  if (currency === "EUR") return "EU";
  return "default";
}

export function regionForCountry(
  country: string | null | undefined,
  { eur = EUR_PRICES }: EurOption = {},
): Region {
  return regionForCurrency(currencyForCountry(country, eur));
}

/**
 * "inr" → IN, "usd" → default, "eur" → EU (only while euro prices are on),
 * anything else → null (no override).
 */
export function regionForOverride(
  value: unknown,
  { eur = EUR_PRICES }: EurOption = {},
): Region | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  switch (raw.trim().toLowerCase()) {
    case "inr":
      return "IN";
    case "usd":
      return "default";
    case "eur":
      return eur ? "EU" : null;
    default:
      return null;
  }
}

export function currencyForRegion(region: Region): PricingCurrency {
  if (region === "IN") return "INR";
  if (region === "EU") return "EUR";
  return "USD";
}

export function overrideForCurrency(
  currency: PricingCurrency,
): CurrencyOverride {
  return currency.toLowerCase() as CurrencyOverride;
}

export interface RegionSources {
  /** The `?currency=` search param */
  param?: unknown;
  /** The currency cookie's value */
  cookie?: string | null;
  /** Request headers */
  headers?: Pick<Headers, "get"> | null;
}

/** The visitor's country from the geo headers, or null when none is set. */
export function countryFromHeaders(
  headers: Pick<Headers, "get"> | null | undefined,
): string | null {
  for (const name of COUNTRY_HEADERS) {
    const country = headers?.get(name)?.trim();
    if (country) return country.toUpperCase();
  }
  return null;
}

/** Override param, then cookie, then geo header; "default" when none match. */
export function resolveRegion(
  { param, cookie, headers }: RegionSources,
  options: EurOption = {},
): Region {
  const override =
    regionForOverride(param, options) ?? regionForOverride(cookie, options);
  if (override) return override;
  const country = countryFromHeaders(headers);
  return country ? regionForCountry(country, options) : "default";
}

/**
 * The currency checkout charges, as Polar names it: the one for the
 * visitor's country (never the display switch, so nobody picks a cheaper
 * region's price). Polar would otherwise pick it from the IP address of the
 * server that creates the session, not the visitor's.
 */
export function checkoutCurrency(
  headers: Pick<Headers, "get"> | null | undefined,
  options: EurOption = {},
): CurrencyOverride {
  const country = countryFromHeaders(headers);
  return overrideForCurrency(
    currencyForRegion(country ? regionForCountry(country, options) : "default"),
  );
}
