import type { DeliveryStatus } from "@/lib/events/types";

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

/** Same output on server and client (UTC), so no hydration mismatch. */
export const formatDeliveryTime = (value: Date | string) =>
  dateTime.format(new Date(value));

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "Pending",
  succeeded: "Delivered",
  failed: "Failed",
};

/** "example.com/hooks/…" for compact lists. */
export function shortUrl(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.host}${path.length > 32 ? `${path.slice(0, 31)}…` : path}`;
  } catch {
    return value;
  }
}
