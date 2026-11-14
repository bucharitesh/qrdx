// Client-safe parts of public analytics pages (lib/public-stats.ts).

import type { ClientBrand } from "@/lib/client-brands-shared";
import type { ScanRange, SeriesInterval } from "@/lib/scan-ranges";
import type { BreakdownRow, DailyCount, ScanSourceCounts } from "@/lib/scans";

/** "all" only for plans that keep the whole history (Pro and Business). */
export const PUBLIC_STATS_RANGES = [
  "7d",
  "30d",
  "90d",
  "all",
] as const satisfies readonly ScanRange[];
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
  // Agency tools (feat/agency-tools)
  /** The client brand the page shows (Pro and Business), or null */
  brand: Omit<ClientBrand, "id"> | null;
  /** Business: a branded page shows no QRdx mark */
  hideQrdx: boolean;
  /** The short link is on QRdx's host, so a page without QRdx marks hides it */
  hideShortLink: boolean;
  analytics: {
    /** First day of the range (00:00 UTC), ISO string */
    from: string;
    days: number;
    total: number;
    unique: number;
    /** What one `series` point counts: a UTC day, week or month */
    interval: SeriesInterval;
    series: DailyCount[];
    countries: BreakdownRow[];
    devices: BreakdownRow[];
    /** Referrer hosts */
    referrers: BreakdownRow[];
    /** QR scans and NFC taps (they add up to `total`) */
    sources: ScanSourceCounts;
  };
}

// ─── Client branding of a shared page (agency tools) ────────────────────────

/** What the share dialog needs to brand a code's page. */
export interface StatsBranding {
  /** false until manual-sql/2026-11-11-agency.sql is applied */
  available: boolean;
  /** The viewer may change it (owners, admins and members) */
  canManage: boolean;
  /** The plan includes client branding (Pro and Business) */
  allowed: boolean;
  /** The plan drops the QRdx mark and serves links on custom domains (Business) */
  whiteLabel: boolean;
  /** The cheapest plans with each, for the upgrade line */
  brandingPlan: string | null;
  whiteLabelPlan: string | null;
  /** The brand the page shows now */
  brandId: string | null;
  /** The workspace's client brands */
  brands: ClientBrand[];
  /** The custom domain the link is on now */
  domainId: string | null;
  /** The workspace's verified custom domains (Business only, else empty) */
  domains: { id: string; hostname: string }[];
}

/** /stats/<token> on a host: QRdx's own, or a customer's verified domain. */
export const publicStatsUrlOn = (hostname: string, token: string) =>
  `https://${hostname}${publicStatsPath(token)}`;
