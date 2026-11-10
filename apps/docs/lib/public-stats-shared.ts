// Client-safe parts of public analytics pages (lib/public-stats.ts).

import type { BreakdownRow, DailyCount, ScanSourceCounts } from "@/lib/scans";

export const PUBLIC_STATS_RANGES = ["7d", "30d", "90d"] as const;
export type PublicStatsRange = (typeof PUBLIC_STATS_RANGES)[number];
export const DEFAULT_PUBLIC_STATS_RANGE: PublicStatsRange = "30d";

export const publicStatsPath = (token: string) =>
  `/stats/${encodeURIComponent(token)}`;

export function parsePublicStatsRange(value: unknown): PublicStatsRange {
  const first = Array.isArray(value) ? value[0] : value;
  return (PUBLIC_STATS_RANGES as readonly string[]).includes(first)
    ? (first as PublicStatsRange)
    : DEFAULT_PUBLIC_STATS_RANGE;
}

export interface PublicStatsShare {
  /** false until manual-sql/0016 is applied */
  available: boolean;
  /** The viewer may turn sharing on or off and reset the link */
  canManage: boolean;
  /** The public link while sharing is on */
  url: string | null;
  /** When the current link was made (ISO string) */
  since: string | null;
}

/** What /stats/<token> shows: aggregates only, nothing about a visitor. */
export interface PublicStats {
  code: {
    title: string | null;
    shortLink: string;
    /** The destination's host only: never its path or query string */
    destinationHost: string | null;
    createdAt: string;
  };
  range: PublicStatsRange;
  /** Ranges the workspace's plan keeps */
  ranges: PublicStatsRange[];
  analytics: {
    days: number;
    total: number;
    unique: number;
    series: DailyCount[];
    countries: BreakdownRow[];
    devices: BreakdownRow[];
    /** Referrer hosts */
    referrers: BreakdownRow[];
    /** QR scans and NFC taps (they add up to `total`) */
    sources: ScanSourceCounts;
  };
}
