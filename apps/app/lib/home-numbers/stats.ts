// What "QRdx in numbers" shows, built from the counts in
// lib/home-numbers/query.ts. Pure and client-safe (types only reach the
// client component).

import { type CompactCount, compactCount } from "@/lib/home-numbers/format";

/** The counts as read from the database, before any rounding. */
export interface HomeNumberCounts {
  /** Dynamic QR codes of counted accounts, minus those an admin switched off */
  codes: number;
  /** First month of those codes, "YYYY-MM" (UTC) */
  codesSince: string | null;
  /** Recorded scans of those codes (qr_code.scan_count) */
  scans: number;
  /** First month of any recorded scan, "YYYY-MM" (UTC) */
  scansSince: string | null;
  /** Distinct countries of every recorded scan of a dynamic code */
  countries: number;
  /** Verified, unbanned accounts outside reserved test domains */
  accounts: number;
  /** First month of those accounts, "YYYY-MM" (UTC) */
  accountsSince: string | null;
}

export const HOME_NUMBER_IDS = [
  "codes",
  "scans",
  "countries",
  "accounts",
] as const;
export type HomeNumberId = (typeof HOME_NUMBER_IDS)[number];

/**
 * Each label says exactly what is counted (lib/home-numbers/query.ts has
 * the rules); `since` names the counts' window.
 */
const LABELS: Record<HomeNumberId, string> = {
  codes: "Dynamic QR codes created",
  scans: "Scans of dynamic QR codes",
  countries: "Countries with scans",
  accounts: "Accounts created",
};

const SINCE: Record<HomeNumberId, keyof HomeNumberCounts> = {
  codes: "codesSince",
  scans: "scansSince",
  countries: "scansSince",
  accounts: "accountsSince",
};

export interface HomeNumber {
  id: HomeNumberId;
  label: string;
  count: CompactCount;
  /** "Since Oct 2026": the month the counted records start */
  since: string | null;
}

export interface HomeNumbers {
  items: HomeNumber[];
  /** When the database was read (ISO) */
  countedAt: string;
}

const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-10" → "Since Oct 2026"; null for anything else. */
export function sinceLabel(month: string | null): string | null {
  const match = month?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return Number.isNaN(date.getTime()) ? null : `Since ${MONTH.format(date)}`;
}

/**
 * The stats to show, in order. A count of zero is left out (it says
 * nothing); null when nothing is left, so the section isn't rendered. A
 * value that isn't a count throws (compactCount), so it's never shown.
 */
export function buildHomeNumbers(
  counts: HomeNumberCounts,
  countedAt: string,
): HomeNumbers | null {
  const items = HOME_NUMBER_IDS.flatMap((id): HomeNumber[] => {
    const count = compactCount(counts[id]);
    if (count.value === 0) return [];
    const since = counts[SINCE[id]];
    return [
      {
        id,
        label: LABELS[id],
        count,
        since: typeof since === "string" ? sinceLabel(since) : null,
      },
    ];
  });
  return items.length > 0 ? { items, countedAt } : null;
}
