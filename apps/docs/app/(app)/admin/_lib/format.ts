type DateInput = Date | string | null | undefined;

const toDate = (value: DateInput) => (value ? new Date(value) : null);

/** UTC date, e.g. 2026-10-31. */
export function formatDate(value: DateInput) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : "—";
}

/** UTC date and time, e.g. 2026-10-31 14:05 UTC. */
export function formatDateTime(value: DateInput) {
  const date = toDate(value);
  return date
    ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`
    : "—";
}

export const formatNumber = (value: number) => value.toLocaleString("en-US");

/** Polar amounts are stored in minor units (cents). */
export function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** "just now", "5 min ago", "3 h ago", "12 d ago", then the date. */
export function formatAgo(value: DateInput, now: Date = new Date()) {
  const date = toDate(value);
  if (!date) return "—";
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 0) return formatDateTime(date);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 30 * 86_400) return `${Math.floor(seconds / 86_400)} d ago`;
  return formatDate(date);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
