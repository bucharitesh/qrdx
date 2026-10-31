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
