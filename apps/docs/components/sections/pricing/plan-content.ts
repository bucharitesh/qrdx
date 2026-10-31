// Pricing-page copy derived from the plan limits (lib/plans.ts is the single
// source of truth). Pure and client-safe: the server page passes the limits in.

import { AI_REQUEST_FREE_TIER_LIMIT } from "@/lib/constants";
import type { PlanLimits } from "@/lib/plans";
import {
  formatPrice,
  type PaidPlan,
  type Plan,
  PRICING,
  type PricingCurrency,
} from "@/lib/pricing";

export type PlanLimitsByPlan = Record<Plan, PlanLimits>;

export type CellValue = string | boolean;

export interface ComparisonRow {
  feature: string;
  hint?: string;
  values: Record<Plan, CellValue>;
}

export interface ComparisonGroup {
  title: string;
  rows: ComparisonRow[];
}

/** Planned plan features that aren't built yet; shown as "Coming soon". */
const NOT_YET_AVAILABLE = new Set<keyof PlanLimits>([
  "folderPermissions",
  "auditLog",
]);

const COMING_SOON = "Coming soon";

const MB = 1024 * 1024;
const GB = 1024 * MB;

export function formatCount(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "Unlimited";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "Unlimited";
  if (bytes >= GB) return `${formatCount(bytes / GB)} GB`;
  return `${formatCount(Math.round(bytes / MB))} MB`;
}

export function formatDays(days: number): string {
  if (!Number.isFinite(days)) return "Unlimited";
  if (days % 365 === 0) {
    const years = days / 365;
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  return `${formatCount(days)} days`;
}

const months = (days: number) => Math.round(days / 30.4375);

/** Whole-percent saving of the yearly price over 12 monthly payments. */
export function yearlySavingsPercent(
  plan: PaidPlan,
  currency: PricingCurrency,
): number {
  const monthly = PRICING[plan].month.amounts[currency];
  const yearly = PRICING[plan].year.amounts[currency];
  return Math.round((1 - yearly / (monthly * 12)) * 100);
}

/** Largest yearly saving across paid plans, for the billing toggle. */
export function maxYearlySavingsPercent(currency: PricingCurrency): number {
  return Math.max(
    yearlySavingsPercent("pro", currency),
    yearlySavingsPercent("business", currency),
  );
}

const PLANS: readonly Plan[] = ["free", "pro", "business"];

function row(
  feature: string,
  value: (limits: PlanLimits, plan: Plan) => CellValue,
  hint?: string,
): (limits: PlanLimitsByPlan) => ComparisonRow {
  return (limits) => ({
    feature,
    ...(hint && { hint }),
    values: Object.fromEntries(
      PLANS.map((plan) => [plan, value(limits[plan], plan)]),
    ) as Record<Plan, CellValue>,
  });
}

/** A plan flag, or "Coming soon" where the plan includes a feature not built yet. */
function flag(...keys: (keyof PlanLimits)[]) {
  return (limits: PlanLimits): CellValue => {
    if (!keys.every((key) => Boolean(limits[key]))) return false;
    return keys.some((key) => NOT_YET_AVAILABLE.has(key)) ? COMING_SOON : true;
  };
}

function landingPages(limits: PlanLimits): string {
  const count = formatCount(limits.landingPages);
  if (limits.landingPageBadge) return `${count}, with "Made with QRdx" footer`;
  if (limits.whiteLabel && limits.customCss) {
    return `${count}, white-label + custom CSS`;
  }
  if (limits.whiteLabel) return `${count}, white-label`;
  return `${count}, no footer`;
}

function analyticsHistory(limits: PlanLimits): string {
  const history = formatDays(limits.analyticsRetentionDays);
  if (
    !Number.isFinite(limits.analyticsRetentionDays) &&
    Number.isFinite(limits.rawScanRetentionDays)
  ) {
    return `${history} (scan-level for ${months(limits.rawScanRetentionDays)} months, then daily totals)`;
  }
  return history;
}

function teamMembers(limits: PlanLimits): string {
  if (!limits.teams) return "1 (no teams)";
  return formatCount(limits.teamMembers);
}

const GROUPS: {
  title: string;
  rows: ((limits: PlanLimitsByPlan) => ComparisonRow)[];
}[] = [
  {
    title: "QR codes and pages",
    rows: [
      row("Static QR codes", () => "Unlimited", "No account needed"),
      row("Dynamic QR codes", (l) => formatCount(l.dynamicCodes)),
      row("Scans", () => "Unlimited", "Never paused, no ads"),
      row("Hosted landing pages", landingPages),
      row("Saved themes", (l) =>
        l.teamThemes
          ? `${formatCount(l.savedThemes)}, shared with your team`
          : formatCount(l.savedThemes),
      ),
      row("AI theme generations", (_, plan) =>
        plan === "free"
          ? `${AI_REQUEST_FREE_TIER_LIMIT} in total`
          : "Unlimited",
      ),
      row("AI art images per month", (l) =>
        l.aiArtPooled
          ? `${formatCount(l.aiArtPerMonth)}, pooled per team`
          : formatCount(l.aiArtPerMonth),
      ),
    ],
  },
  {
    title: "Analytics and link controls",
    rows: [
      row("Analytics history", analyticsHistory),
      row(
        "Smart routing, A/B tests and UTM tags",
        flag("routing"),
        "Send scans by device, country, time or language",
      ),
      row("Password, schedule, expiry and scan limits", flag("linkControls")),
      row("Retargeting pixels", flag("pixels"), "GA4, Meta, GTM, TikTok"),
      row("Conversion tracking", flag("conversions")),
    ],
  },
  {
    title: "Brand and team",
    rows: [
      row("Custom domains", (l) =>
        l.customDomains > 0 ? formatCount(l.customDomains) : false,
      ),
      row("Team members", teamMembers),
      row("Folder permissions", flag("folderPermissions")),
      row("Audit log", flag("auditLog")),
    ],
  },
  {
    title: "Files and forms",
    rows: [
      row(
        "File storage",
        (l) =>
          `${formatBytes(l.storageBytes)} (${formatBytes(l.maxFileBytes)} per file)`,
      ),
      row("Form responses per month", (l) =>
        formatCount(l.formResponsesPerMonth),
      ),
    ],
  },
  {
    title: "Automation and API",
    rows: [
      row("Email digests and alerts", flag("emailAlerts")),
      row("Webhooks, Zapier and Slack", flag("webhooks")),
      row("API requests per day", (l) =>
        l.bulkApi
          ? `${formatCount(l.apiRequestsPerDay)} + bulk creation`
          : formatCount(l.apiRequestsPerDay),
      ),
    ],
  },
];

/** The price row for the comparison table, in one display currency. */
export function priceRow(currency: PricingCurrency): ComparisonRow {
  const paid = (plan: PaidPlan) =>
    `${formatPrice(PRICING[plan].month.amounts[currency], currency)}/mo or ${formatPrice(PRICING[plan].year.amounts[currency], currency)}/yr`;
  return {
    feature: "Price",
    values: {
      free: formatPrice(0, currency),
      pro: paid("pro"),
      business: paid("business"),
    },
  };
}

export function buildComparison(
  limits: PlanLimitsByPlan,
  currency: PricingCurrency,
): ComparisonGroup[] {
  return [
    { title: "Price", rows: [priceRow(currency)] },
    ...GROUPS.map((group) => ({
      title: group.title,
      rows: group.rows.map((build) => build(limits)),
    })),
  ];
}

/** Short feature lists for the plan cards. */
export function buildHighlights(
  limits: PlanLimitsByPlan,
): Record<Plan, string[]> {
  const { free, pro, business } = limits;
  return {
    free: [
      "Unlimited static QR codes, no account needed",
      `${formatCount(free.dynamicCodes)} dynamic QR codes with scan analytics`,
      "Unlimited scans, never paused, no ads",
      `${formatCount(free.landingPages)} hosted landing pages`,
      `${formatDays(free.analyticsRetentionDays)} of analytics history`,
      `${formatBytes(free.storageBytes)} of file storage`,
    ],
    pro: [
      "Unlimited dynamic codes and landing pages",
      `${formatDays(pro.analyticsRetentionDays)} of analytics history`,
      `${formatCount(pro.customDomains)} custom domains`,
      `Teams of up to ${formatCount(pro.teamMembers)} people`,
      pro.teamThemes
        ? "Unlimited saved themes, shared with your team"
        : "Unlimited saved themes",
      "Smart routing, A/B tests, UTM tags and pixels",
      "Passwords, schedules, expiry and scan limits",
      `${formatBytes(pro.storageBytes)} storage, ${formatCount(pro.formResponsesPerMonth)} form responses a month`,
    ],
    business: [
      "White-label pages with custom CSS",
      `${formatDays(business.analyticsRetentionDays)} analytics history`,
      `${formatCount(business.customDomains)} custom domains`,
      "Unlimited team members",
      "Conversion tracking",
      "Webhooks, Zapier and Slack",
      `${formatBytes(business.storageBytes)} storage, ${formatCount(business.formResponsesPerMonth)} form responses a month`,
      `${formatCount(business.aiArtPerMonth)} AI art images a month, pooled per team`,
    ],
  };
}
