// Plan & usage: how each limit is shown. Pure (no server imports), so the
// page, its client parts and the tests share it.

import { formatBytes } from "@/lib/files/types";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";

export type MeterId =
  | "dynamicCodes"
  | "landingPages"
  | "formResponses"
  | "storage"
  | "teamSeats"
  | "customDomains"
  | "savedThemes"
  | "oauthApps"
  | "aiArt"
  | "aiThemes";

export interface Meter {
  id: MeterId;
  label: string;
  used: number;
  /** null = unlimited; 0 = not on this plan */
  limit: number | null;
  unit: "count" | "bytes";
  /** When a monthly count starts over (ISO string) */
  resetsAt?: string;
  /** One short line under the meter */
  note?: string;
}

export type MeterLevel = "ok" | "near" | "full" | "unlimited" | "excluded";

/** At or above this share of a limit the meter warns. */
export const NEAR_LIMIT = 0.9;

export function meterLevel(meter: Pick<Meter, "used" | "limit">): MeterLevel {
  if (meter.limit === null) return "unlimited";
  if (meter.limit <= 0) return "excluded";
  if (meter.used >= meter.limit) return "full";
  return meter.used / meter.limit >= NEAR_LIMIT ? "near" : "ok";
}

/** 0–100 for the bar (100 when over the limit, 0 without a cap). */
export function meterPercent(meter: Pick<Meter, "used" | "limit">): number {
  if (meter.limit === null || meter.limit <= 0) return 0;
  return Math.min(100, Math.round((meter.used / meter.limit) * 1000) / 10);
}

const count = (value: number) => value.toLocaleString("en-US");

function amount(meter: Meter, value: number): string {
  return meter.unit === "bytes" ? formatBytes(value) : count(value);
}

/** "3 of 10", "1.2 MB of 50 MB", "12 · Unlimited", "Not on Free". */
export function meterValue(meter: Meter, plan: Plan): string {
  if (meter.limit === null) return `${amount(meter, meter.used)} · Unlimited`;
  if (meter.limit <= 0) {
    return meter.used > 0
      ? `${amount(meter, meter.used)} · Not on ${PLAN_NAMES[plan]}`
      : `Not on ${PLAN_NAMES[plan]}`;
  }
  return `${amount(meter, meter.used)} of ${amount(meter, meter.limit)}`;
}

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const LONG_DAY = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Resets Dec 1" for monthly counts. */
export function resetLine(resetsAt: string | undefined): string | null {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  return Number.isNaN(date.getTime()) ? null : `Resets ${DAY.format(date)}`;
}

/** The signed-in person's own subscription, as the page needs it. */
export interface SubscriptionSummary {
  plan: Plan;
  status: string;
  interval: string;
  /** End of the current period (ISO string) */
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  /** Set when Polar has scheduled the end (ISO string) */
  endsAt: string | null;
}

/** "Renews on December 2, 2026 · billed yearly", or when it ends. */
export function renewalLine(subscription: SubscriptionSummary): string {
  const ends = subscription.endsAt ?? subscription.currentPeriodEnd;
  const periodEnd = new Date(subscription.currentPeriodEnd);
  const endDate = new Date(ends);
  if (subscription.cancelAtPeriodEnd || subscription.endsAt) {
    return Number.isNaN(endDate.getTime())
      ? "Canceled. It stays active until the end of this period."
      : `Ends on ${LONG_DAY.format(endDate)}. Your codes keep working after that.`;
  }
  if (Number.isNaN(periodEnd.getTime())) return "Active";
  const when = LONG_DAY.format(periodEnd);
  if (subscription.status === "trialing") return `Trial ends on ${when}`;
  const billed =
    subscription.interval === "year"
      ? " · billed yearly"
      : subscription.interval === "month"
        ? " · billed monthly"
        : "";
  return `Renews on ${when}${billed}`;
}

export interface UpgradeAction {
  label: string;
  href: string;
}

/**
 * Where "upgrade" goes for this workspace, or null: Business is the top
 * plan, and only team owners can change a team's plan.
 */
export function upgradeAction(
  plan: Plan,
  canChangePlan: boolean,
): UpgradeAction | null {
  if (!canChangePlan || plan === "business") return null;
  return {
    label: plan === "free" ? "Upgrade to Pro" : "Upgrade to Business",
    href: "/pricing",
  };
}
