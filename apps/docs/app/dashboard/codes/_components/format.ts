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

/** "2026-10-31" → "Oct 31" */
export function formatDay(value: string): string {
  return dayFormat.format(new Date(`${value}T00:00:00Z`));
}

export const formatNumber = (value: number) => value.toLocaleString("en-US");

/** Destination shown without the protocol and trailing slash. */
export function displayUrl(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
