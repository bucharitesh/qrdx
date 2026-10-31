/**
 * Content sources: list things in a connected account (payment links, event
 * types, products, videos, playlists) and turn one into QR content in one
 * click. Client-safe types only.
 */

export const CONTENT_SOURCE_PROVIDERS = [
  "stripe",
  "calcom",
  "calendly",
  "shopify",
  "youtube",
  "spotify",
] as const;

export type ContentSourceSlug = (typeof CONTENT_SOURCE_PROVIDERS)[number];

/** The editor content type each source fills in. */
export const CONTENT_SOURCE_CONTENT_TYPES: Record<ContentSourceSlug, string> = {
  stripe: "url",
  calcom: "calcom",
  calendly: "url",
  shopify: "url",
  youtube: "youtube",
  spotify: "spotify",
};

export function isContentSourceProvider(
  slug: string
): slug is ContentSourceSlug {
  return (CONTENT_SOURCE_PROVIDERS as readonly string[]).includes(slug);
}

/** Sources for one editor content type, in display order. */
export function contentSourcesFor(contentType: string): ContentSourceSlug[] {
  return CONTENT_SOURCE_PROVIDERS.filter(
    (slug) => CONTENT_SOURCE_CONTENT_TYPES[slug] === contentType
  );
}

export interface SourceItem {
  id: string;
  title: string;
  /** Price, duration or kind, e.g. "$25.00" or "30 min". */
  subtitle?: string;
  /** What the QR code encodes. */
  url: string;
  /** https thumbnail, when the provider has one. */
  image?: string;
  /** Short caveat, e.g. "Test mode" or "Not on your online store". */
  badge?: string;
}

export interface SourcePage {
  items: SourceItem[];
  nextCursor?: string;
}

export interface ListSourceOptions {
  cursor?: string;
  search?: string;
}

export interface ContentSourceClient {
  list(options?: ListSourceOptions): Promise<SourcePage>;
}

/** Case-insensitive title/subtitle filter for APIs without search. */
export function filterSourceItems(
  items: SourceItem[],
  search: string | undefined
): SourceItem[] {
  const query = search?.trim().toLowerCase();
  if (!query) return items;
  return items.filter((item) =>
    [item.title, item.subtitle ?? ""].some((text) =>
      text.toLowerCase().includes(query)
    )
  );
}

/** Formats a minor-unit amount, e.g. (2500, "usd") → "$25.00". */
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale = "en-US"
): string {
  const code = currency.toUpperCase();
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: code,
      }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${code}`;
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
  }).format(amountMinor / 10 ** digits);
}

/** Formats a decimal amount string, e.g. ("19.5", "EUR") → "€19.50". */
export function formatDecimalMoney(
  amount: string,
  currency: string,
  locale = "en-US"
): string {
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

/** Only https URLs leave a client (thumbnails, links). */
export function httpsOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return;
  }
}
