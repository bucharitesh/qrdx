// Date ranges of scan analytics: which one a plan may read, how many days it
// covers and how its series is bucketed. No server imports, so the charts,
// the API schemas and the tests use it as is; lib/scans.ts runs the queries.
//
// Every range is whole UTC days ending today. "all" starts on the day of the
// first scan of the code or workspace (its creation when nothing was scanned
// yet) and only plans that keep the whole history get it (lib/scan-history.ts).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days each range covers; "all" reaches as far back as the history goes. */
export const SCAN_RANGES = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
  "1095d": 1095,
  all: Number.POSITIVE_INFINITY,
} as const satisfies Record<string, number>;

export type ScanRange = keyof typeof SCAN_RANGES;

export const ALL_TIME_RANGE = "all" satisfies ScanRange;

export const DEFAULT_SCAN_RANGE = "30d" satisfies ScanRange;

/** In picker order: shortest first, "all" last. */
export const SCAN_RANGE_KEYS = Object.keys(SCAN_RANGES) as ScanRange[];

export const isScanRange = (value: unknown): value is ScanRange =>
  typeof value === "string" && Object.hasOwn(SCAN_RANGES, value);

/** "30 days", "1 year", "3 years", "All time" (English, for logs and API docs) */
export function scanRangeLabel(range: ScanRange): string {
  const days = SCAN_RANGES[range];
  if (!Number.isFinite(days)) return "All time";
  if (days < 365) return `${days} days`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"}`;
}

/**
 * The requested range when the plan's history reaches that far, else 30
 * days (or the longest the plan has). "all" needs a plan that keeps the
 * whole history; old links with a fixed range keep working.
 */
export function resolveScanRange(
  value: unknown,
  retentionDays: number,
): ScanRange {
  const allowed = SCAN_RANGE_KEYS.filter(
    (key) => SCAN_RANGES[key] <= retentionDays,
  );
  const fallback = allowed.includes(DEFAULT_SCAN_RANGE)
    ? DEFAULT_SCAN_RANGE
    : (allowed.at(-1) ?? "7d");
  return isScanRange(value) && allowed.includes(value) ? value : fallback;
}

const utcDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** Whole UTC days from `start`'s day to today, both included (at least 1). */
export function daysSince(start: Date, now: Date = new Date()): number {
  const days = Math.round((utcDay(now) - utcDay(start)) / DAY_MS) + 1;
  return Number.isFinite(days) ? Math.max(1, days) : 1;
}

/**
 * Days `range` covers, today included. "all" counts from the day of
 * `historyStart` (the first scan, else creation); without one it is today.
 */
export function scanRangeDays(
  range: ScanRange,
  historyStart: Date | null,
  now: Date = new Date(),
): number {
  const days = SCAN_RANGES[range];
  if (Number.isFinite(days)) return days;
  return historyStart ? daysSince(historyStart, now) : 1;
}

/** Start of the UTC day `days - 1` days ago, so a range always includes today. */
export function rangeStart(days: number, now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

// ─── Series buckets ──────────────────────────────────────────────────────────

/** How a series groups scans: per UTC day, ISO week (Monday) or month. */
export type SeriesInterval = "day" | "week" | "month";

/** Daily points up to 3 years: every fixed range, and "all" until then. */
export const DAILY_SERIES_MAX_DAYS = 1095;
/** Weekly points up to 10 years (at most 523), monthly beyond. */
export const WEEKLY_SERIES_MAX_DAYS = 3650;

/** The bucket for a span of `days`. */
export function seriesInterval(days: number): SeriesInterval {
  if (days <= DAILY_SERIES_MAX_DAYS) return "day";
  if (days <= WEEKLY_SERIES_MAX_DAYS) return "week";
  return "month";
}

const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Start of the bucket holding `time` (Postgres date_trunc in UTC). */
function bucketStart(time: number, interval: SeriesInterval): number {
  const date = new Date(time);
  const day = utcDay(date);
  if (interval === "day") return day;
  if (interval === "week") {
    // date_trunc('week') starts weeks on Monday.
    return day - ((date.getUTCDay() + 6) % 7) * DAY_MS;
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function nextBucket(time: number, interval: SeriesInterval): number {
  if (interval === "day") return time + DAY_MS;
  if (interval === "week") return time + 7 * DAY_MS;
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/**
 * The start date (YYYY-MM-DD) of every bucket from `from` through its last
 * day, oldest first. The first week or month can start before `from`.
 */
export function seriesDates(
  from: Date,
  days: number,
  interval: SeriesInterval,
): string[] {
  const last = utcDay(from) + (days - 1) * DAY_MS;
  const dates: string[] = [];
  for (
    let cursor = bucketStart(from.getTime(), interval);
    cursor <= last;
    cursor = nextBucket(cursor, interval)
  ) {
    dates.push(isoDate(cursor));
  }
  return dates;
}

/** Counts per bucket start, with empty buckets as 0. */
export function fillSeries(
  rows: { day: string; count: number }[],
  from: Date,
  days: number,
  interval: SeriesInterval,
): { date: string; count: number }[] {
  const byBucket = new Map<string, number>();
  for (const row of rows) {
    byBucket.set(row.day, (byBucket.get(row.day) ?? 0) + Number(row.count));
  }
  return seriesDates(from, days, interval).map((date) => ({
    date,
    count: byBucket.get(date) ?? 0,
  }));
}
