// Plan & usage: how each limit is shown. Pure (no server imports), so the
// page, its client parts and the tests share it.

import { formatBytes } from "@/lib/files/types";
import type { PlanLimits } from "@/lib/plans";
import { type PaidPlan, PLAN_NAMES, type Plan } from "@/lib/pricing";

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

const METER_LABELS: Record<MeterId, string> = {
  dynamicCodes: "Dynamic QR codes",
  landingPages: "Landing pages",
  formResponses: "Form responses this month",
  storage: "File storage",
  teamSeats: "Team seats",
  customDomains: "Custom domains",
  savedThemes: "Saved themes",
  oauthApps: "OAuth apps",
  aiArt: "AI art images this month",
  aiThemes: "AI theme requests",
};

/** A meter's name; a team's saved themes are the ones it shares. */
export function meterLabel(id: MeterId, { isTeam = false } = {}): string {
  return id === "savedThemes" && isTeam ? "Shared themes" : METER_LABELS[id];
}

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

/** A meter, or why it couldn't be read this time. */
export type MeterResult = Meter | { id: MeterId; label: string; failed: true };

export const isReadMeter = (meter: MeterResult): meter is Meter =>
  !("failed" in meter);

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
  /** The plan it upgrades to */
  plan: PaidPlan;
}

/**
 * Where "upgrade" goes for this workspace, or null: Business is the top
 * plan, and only team owners can change a team's plan.
 */
export function upgradeAction(
  plan: Plan,
  canChangePlan: boolean,
  checkoutOpen?: CheckoutOpen,
): UpgradeAction | null {
  if (!canChangePlan || plan === "business") return null;
  const next: PaidPlan = plan === "free" ? "pro" : "business";
  return upgradeTo(next, canChangePlan, checkoutOpen);
}

/** Paid plans this deployment can sell right now (lib/checkout-availability). */
export type CheckoutOpen = Record<PaidPlan, boolean>;

/**
 * "Upgrade to <plan>", or null: only owners change a workspace's plan, and
 * a plan checkout can't sell (no Polar product or token here) isn't offered.
 * Without `checkoutOpen` the plan is assumed to be on sale.
 */
export function upgradeTo(
  plan: Plan | null,
  canChangePlan: boolean,
  checkoutOpen?: CheckoutOpen,
): UpgradeAction | null {
  if (!plan || plan === "free" || !canChangePlan) return null;
  if (checkoutOpen && !checkoutOpen[plan]) return null;
  return { label: `Upgrade to ${PLAN_NAMES[plan]}`, href: "/pricing", plan };
}

// ---------------------------------------------------------------------------
// Caps per plan, what lifts them, and where the UI may block. The plans'
// numbers come in as an argument (lib/plans.ts is server-only):
// app/settings/usage/_lib/meter-caps.ts passes PLAN_LIMITS.

/** A meter's cap on the workspace's plan and the next plan that raises it. */
export interface MeterCap {
  /** null = unlimited; 0 = not on this plan */
  limit: number | null;
  /** The cheapest higher plan with more (limit null = unlimited); null = none */
  lift: {
    plan: Plan;
    limit: number | null;
    /** The lifted allowance is the workspace's, not each person's (AI art) */
    shared?: true;
  } | null;
}

export type MeterCaps = Partial<Record<MeterId, MeterCap>>;

const PLAN_ORDER: readonly Plan[] = ["free", "pro", "business"];

/** The plan field behind each meter; savedThemes in a team needs team themes. */
const CAP_OF: Partial<
  Record<MeterId, (limits: PlanLimits, isTeam: boolean) => number>
> = {
  dynamicCodes: (l) => l.dynamicCodes,
  landingPages: (l) => l.landingPages,
  formResponses: (l) => l.formResponsesPerMonth,
  storage: (l) => l.storageBytes,
  teamSeats: (l) => l.teamMembers,
  customDomains: (l) => l.customDomains,
  savedThemes: (l, isTeam) => (isTeam && !l.teamThemes ? 0 : l.savedThemes),
  oauthApps: (l) => l.oauthApps,
  aiArt: (l) => l.aiArtPerMonth,
};

const asCap = (value: number) => (Number.isFinite(value) ? value : null);

/** More room: unlimited beats any number. */
const raises = (next: number | null, current: number | null) =>
  current !== null && (next === null || next > current);

/**
 * Every plan-set meter's cap on `plan`, and which higher plan lifts it.
 * AI theme requests aren't a plan field (any subscription removes the
 * one-time allowance), so plan-usage.ts gives that meter its own cap.
 */
export function resolveMeterCaps(
  limitsByPlan: Record<Plan, PlanLimits>,
  plan: Plan,
  { isTeam }: { isTeam: boolean },
): MeterCaps {
  const caps: MeterCaps = {};
  const higher = PLAN_ORDER.slice(PLAN_ORDER.indexOf(plan) + 1);
  for (const [id, capOf] of Object.entries(CAP_OF) as [
    MeterId,
    (limits: PlanLimits, isTeam: boolean) => number,
  ][]) {
    const limit = asCap(capOf(limitsByPlan[plan], isTeam));
    let lift: MeterCap["lift"] = null;
    for (const next of higher) {
      const nextLimit = asCap(capOf(limitsByPlan[next], isTeam));
      if (raises(nextLimit, limit)) {
        lift = {
          plan: next,
          limit: nextLimit,
          ...(id === "aiArt" && limitsByPlan[next].aiArtPooled
            ? { shared: true as const }
            : {}),
        };
        break;
      }
    }
    caps[id] = { limit, lift };
  }
  return caps;
}

/**
 * Limits the server refuses past when something new is created, so the UI
 * may block there too ("gate where it bites"). Form responses are refused
 * on the public form, never in the app, so the app only warns about them.
 */
export const ENFORCED_ON_CREATE: Record<MeterId, boolean> = {
  // createCodes and restoring archived codes (codes/_lib/qr-codes.ts, organize.ts)
  dynamicCodes: true,
  // createLandingPage (pages/_lib/landing-pages.ts)
  landingPages: true,
  // The public form endpoint stops accepting; pages stay live
  formResponses: false,
  // Upload checks (lib/files/quota.ts)
  storage: true,
  // Better Auth membershipLimit and invitationLimit (packages/auth)
  teamSeats: true,
  // addCustomDomain (domains/_lib/domains.ts)
  customDomains: true,
  // Saving or copying a theme (actions/qr-themes.ts)
  savedThemes: true,
  // createOAuthApp (lib/oauth-apps/service.ts)
  oauthApps: true,
  // Art credits are reserved before a run (lib/ai/art.ts)
  aiArt: true,
  // AI requests on Free (lib/subscription.ts)
  aiThemes: true,
};

export type MeterGate = "block" | "warn" | "none";

/** Block at a full, server-enforced cap; warn from 90%; nothing otherwise. */
export function meterGate(
  meter: Pick<Meter, "id" | "used" | "limit">,
): MeterGate {
  const level = meterLevel(meter);
  if (level === "full") return ENFORCED_ON_CREATE[meter.id] ? "block" : "warn";
  return level === "near" ? "warn" : "none";
}

/** Meters at 90% or more of a cap, full ones first, then the fullest. */
export function attentionMeters(meters: readonly MeterResult[]): Meter[] {
  return meters
    .filter(isReadMeter)
    .filter((meter) => {
      const level = meterLevel(meter);
      return level === "near" || level === "full";
    })
    .sort((a, b) => {
      const full =
        Number(meterLevel(b) === "full") - Number(meterLevel(a) === "full");
      return full || meterPercent(b) - meterPercent(a);
    });
}

/**
 * Meters with a cap (or not on the plan, or unreadable), and the unlimited
 * ones apart: those get no bar, just one "Unlimited on <plan>" line.
 */
export function splitUnlimited(meters: readonly MeterResult[]): {
  capped: MeterResult[];
  unlimited: Meter[];
} {
  const capped: MeterResult[] = [];
  const unlimited: Meter[] = [];
  for (const meter of meters) {
    if (isReadMeter(meter) && meter.limit === null) unlimited.push(meter);
    else capped.push(meter);
  }
  return { capped, unlimited };
}

/** How much is left under a cap ("1", "4.2 MB"); null without one. */
export function meterLeft(meter: Meter): string | null {
  if (meter.limit === null || meter.limit <= 0) return null;
  return amount(meter, Math.max(0, meter.limit - meter.used));
}

/**
 * The AI art meter's line: a pooled allowance is the workspace's, a
 * per-person one in someone else's workspace is still yours.
 */
export function aiArtNote({
  pooled,
  isTeam,
}: {
  pooled: boolean;
  isTeam: boolean;
}): string | undefined {
  if (pooled) return "Shared by everyone in this workspace.";
  return isTeam ? "Counted for you, not the team." : undefined;
}
