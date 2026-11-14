type DateInput = Date | string | null | undefined;

// Fixed locale and UTC so server and client render the same text.
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDate(value: DateInput): string {
  return value ? dateFormat.format(new Date(value)) : "—";
}

const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DAY_MS = 24 * 60 * 60 * 1000;
const utcDate = (value: string) => new Date(`${value}T00:00:00Z`);

/** "2026-10-31" → "Oct 31" */
export function formatDay(value: string): string {
  return dayFormat.format(utcDate(value));
}

/**
 * A chart axis label for a bucket's first day: "Oct 31" per day, "Oct 2026"
 * per week or month (those ranges span years).
 */
export function formatBucket(
  value: string,
  interval: "day" | "week" | "month" = "day",
): string {
  return interval === "day"
    ? formatDay(value)
    : monthFormat.format(utcDate(value));
}

/** A chart tooltip label: "Oct 31", "Oct 26 – Nov 1, 2026" for weeks, "Oct 2026" for months. */
export function formatBucketSpan(
  value: string,
  interval: "day" | "week" | "month" = "day",
): string {
  if (interval !== "week") return formatBucket(value, interval);
  const end = new Date(utcDate(value).getTime() + 6 * DAY_MS);
  return `${formatDay(value)} – ${dateFormat.format(end)}`;
}

export const formatNumber = (value: number) => value.toLocaleString("en-US");

/** Destination shown without the protocol and trailing slash. */
export function displayUrl(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
