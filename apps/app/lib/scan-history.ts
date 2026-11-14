// How far back each plan's scan analytics reach, in days. Infinity is the
// whole history. lib/plans.ts reads these as `analyticsRetentionDays`; they
// live in this light, client-safe module so copy can quote them too: the
// upgrade dialog, the home page and `{facts.freeScanHistoryYears}` in MDX
// (lib/product-facts.ts).
//
// It's only a limit on how far back analytics can be read. Scans themselves
// are kept as long as their code exists: nothing deletes them or rolls them
// up by age or plan (lib/plans.ts, `rawScanRetentionDays`), so a workspace
// that upgrades sees its older scans again.

import type { Plan } from "./pricing";

export const SCAN_HISTORY_DAYS: Readonly<Record<Plan, number>> = {
  free: 365,
  pro: Number.POSITIVE_INFINITY,
  business: Number.POSITIVE_INFINITY,
};

const YEAR = 365;

/**
 * Whole years of history, for copy that says "1 year": null when `days`
 * isn't a whole number of years (or is unlimited).
 */
export function scanHistoryYears(days: number): number | null {
  return Number.isFinite(days) && days % YEAR === 0 ? days / YEAR : null;
}

/** "1 year", "2 years", "90 days" or "unlimited", as English copy writes it. */
export function scanHistoryLabel(days: number): string {
  if (!Number.isFinite(days)) return "unlimited";
  const years = scanHistoryYears(days);
  if (years !== null) return `${years} year${years === 1 ? "" : "s"}`;
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Free's history in whole years, the number translated copy shows ("1 year"
 * in its own plural form). Free's history is a whole number of years; a
 * value that isn't fails here, so copy can't silently say "0.5 years".
 */
export const FREE_SCAN_HISTORY_YEARS: number = (() => {
  const years = scanHistoryYears(SCAN_HISTORY_DAYS.free);
  if (years === null) {
    throw new Error(
      "SCAN_HISTORY_DAYS.free must be a whole number of years: copy writes it in years (lib/scan-history.ts).",
    );
  }
  return years;
})();
