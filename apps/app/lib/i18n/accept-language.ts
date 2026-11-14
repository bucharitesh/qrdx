// The language for pages people reach by scanning a code (/q status pages,
// the location step, the password form, hosted-page chrome on /p). They
// never chose a language on qrdx.dev and those pages have no menu, so QRdx's
// own words follow the browser's Accept-Language. Nothing redirects on it,
// and no other page reads it. Client-safe: no imports beyond the locale list.
//
// Dependency-free on purpose: the rules below (Traditional Chinese falls
// back to English rather than to Simplified; every Portuguese reads the
// Brazilian catalog) would have to wrap a generic matcher anyway, and this
// runs on every scan's response.
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@repo/i18n/config";

/** Longest header we read; anything past it is ignored. */
const MAX_HEADER = 512;
/** At most this many language ranges are considered. */
const MAX_RANGES = 24;

interface Range {
  tag: string;
  q: number;
  order: number;
}

/** `fr-CH, fr;q=0.9, en;q=0.8, *;q=0.5` → ranges, best first (ties keep order). */
export function parseAcceptLanguage(
  header: string | null | undefined,
): Range[] {
  if (!header) return [];
  const ranges: Range[] = [];
  for (const [order, part] of header
    .slice(0, MAX_HEADER)
    .split(",")
    .slice(0, MAX_RANGES)
    .entries()) {
    const [rawTag = "", ...params] = part.trim().split(";");
    const tag = rawTag.trim().toLowerCase();
    if (!/^(?:\*|[a-z]{1,8}(?:-[a-z0-9]{1,8})*)$/.test(tag)) continue;
    let q = 1;
    for (const param of params) {
      if (!/^\s*q\s*=/i.test(param)) continue;
      // A q that isn't 0–1 with up to three decimals: skip the range.
      const match = /^\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/i.exec(
        param,
      );
      q = match ? Number(match[1]) : 0;
    }
    if (q > 0) ranges.push({ tag, q, order });
  }
  return ranges.sort((a, b) => b.q - a.q || a.order - b.order);
}

const BY_LOWERCASE = new Map(
  LOCALES.map((locale) => [locale.toLowerCase(), locale] as const),
);

/**
 * The locale one language range asks for: a Locale, `null` for "English,
 * stop looking" (Traditional Chinese), or undefined when we don't have it.
 */
function matchRange(tag: string): Locale | null | undefined {
  const subtags = tag.split("-");
  const language = subtags[0];
  if (language === "zh") {
    const rest = subtags.slice(1);
    if (rest.includes("hans")) return "zh-Hans";
    // Traditional script, or a region that writes it: there's no catalog
    // yet, and Simplified isn't what these readers asked for.
    if (
      rest.some((s) => s === "hant" || s === "tw" || s === "hk" || s === "mo")
    ) {
      return null;
    }
    return "zh-Hans";
  }
  // Every Portuguese reads the Brazilian catalog.
  if (language === "pt") return "pt-BR";
  // `in` is Indonesian's old code, still sent by some Android browsers.
  if (language === "in") return "id";
  const exact = BY_LOWERCASE.get(tag);
  if (exact) return exact;
  return language ? BY_LOWERCASE.get(language) : undefined;
}

/**
 * The best locale for an Accept-Language header: the highest-q range we
 * have (by exact tag, then by language), English when none matches, the
 * header is missing or malformed, or the best match is Traditional Chinese.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  for (const { tag } of parseAcceptLanguage(header)) {
    if (tag === "*") return DEFAULT_LOCALE;
    const match = matchRange(tag);
    if (match === null) return DEFAULT_LOCALE;
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}
