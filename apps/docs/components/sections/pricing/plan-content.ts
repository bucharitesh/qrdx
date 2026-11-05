// Pricing-page copy derived from the plan limits (lib/plans.ts is the single
// source of truth). Pure and client-safe: the server page passes the limits in.

import { listNames } from "@/lib/availability-copy";
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

// Only built features are sold: planned limits in lib/plans.ts (folder
// permissions, audit log) stay off the pricing page until they ship.

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

/** A plan flag: true when the plan includes every key. */
function flag(...keys: (keyof PlanLimits)[]) {
  return (limits: PlanLimits): CellValue =>
    keys.every((key) => Boolean(limits[key]));
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

// Every scan is kept at full detail for the whole history: nothing rolls raw
// scans up into daily totals yet, so the copy must not promise that.
function analyticsHistory(limits: PlanLimits): string {
  return formatDays(limits.analyticsRetentionDays);
}

function teamMembers(limits: PlanLimits): string {
  if (!limits.teams) return "1 (no teams)";
  return formatCount(limits.teamMembers);
}

// Dropped where AI art isn't available (PricingOptions.aiArt).
const AI_ART_ROW = "AI art images per month";
const AI_THEMES_ROW = "AI theme generations";
const CUSTOM_DOMAINS_ROW = "Custom domains";
const FILE_STORAGE_ROW = "File storage";
const EMAIL_ALERTS_ROW = "Email digests and alerts";
const PIXELS_HINT = "GA4, Meta, GTM, TikTok";
// Tag Manager only loads on custom domains (components/landing/pixels.tsx).
const PIXELS_HINT_WITHOUT_GTM = "GA4, Meta, TikTok, LinkedIn";

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
      row(AI_THEMES_ROW, (_, plan) =>
        plan === "free"
          ? `${AI_REQUEST_FREE_TIER_LIMIT} in total`
          : "Unlimited",
      ),
      row(AI_ART_ROW, (l) =>
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
      row("Retargeting pixels", flag("pixels"), PIXELS_HINT),
      row("Conversion tracking", flag("conversions")),
    ],
  },
  {
    title: "Brand and team",
    rows: [
      row(CUSTOM_DOMAINS_ROW, (l) =>
        l.customDomains > 0 ? formatCount(l.customDomains) : false,
      ),
      row(
        "Custom back-halves",
        flag("customSlugs"),
        "Choose the link, like qrdx.dev/q/spring-menu",
      ),
      row("Team members", teamMembers),
      row(
        "Single sign-on",
        flag("sso"),
        "SAML or OIDC, with your company's identity provider",
      ),
    ],
  },
  {
    title: "Files and forms",
    rows: [
      row(
        FILE_STORAGE_ROW,
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
      row(EMAIL_ALERTS_ROW, flag("emailAlerts")),
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

/**
 * What this deployment can offer (lib/feature-availability-rules.ts): rows
 * and plan-card lines for a feature that can't work here are left out. Each
 * defaults to true.
 */
export interface PricingOptions {
  /** AI QR art (AI_GATEWAY_API_KEY). */
  aiArt?: boolean;
  /** AI themes (AI_GATEWAY_API_KEY). */
  aiThemes?: boolean;
  /** Adding custom domains (on Vercel: VERCEL_API_TOKEN + VERCEL_PROJECT_ID). */
  customDomains?: boolean;
  /** File uploads (Cloudflare R2). */
  fileStorage?: boolean;
  /** Email alerts and digests (Resend). */
  emailAlerts?: boolean;
}

const ROW_FEATURE: Record<string, keyof PricingOptions> = {
  [AI_ART_ROW]: "aiArt",
  [AI_THEMES_ROW]: "aiThemes",
  [CUSTOM_DOMAINS_ROW]: "customDomains",
  [FILE_STORAGE_ROW]: "fileStorage",
  [EMAIL_ALERTS_ROW]: "emailAlerts",
};

const offered = (options: PricingOptions, feature?: keyof PricingOptions) =>
  !feature || options[feature] !== false;

export function buildComparison(
  limits: PlanLimitsByPlan,
  currency: PricingCurrency,
  options: PricingOptions = {},
): ComparisonGroup[] {
  return [
    { title: "Price", rows: [priceRow(currency)] },
    ...GROUPS.map((group) => ({
      title: group.title,
      rows: group.rows
        .map((build) => build(limits))
        .filter((row) => offered(options, ROW_FEATURE[row.feature]))
        .map((row) =>
          row.hint === PIXELS_HINT && !offered(options, "customDomains")
            ? { ...row, hint: PIXELS_HINT_WITHOUT_GTM }
            : row,
        ),
    })),
  ].filter((group) => group.rows.length > 0);
}

/** "5 GB storage, 1,000 form responses a month", without storage when off. */
function storageAndForms(limits: PlanLimits, fileStorage: boolean): string {
  const forms = `${formatCount(limits.formResponsesPerMonth)} form responses a month`;
  return fileStorage
    ? `${formatBytes(limits.storageBytes)} storage, ${forms}`
    : `${forms.charAt(0).toUpperCase()}${forms.slice(1)}`;
}

/** What paid plans add, in a list: "unlimited dynamic codes, …, and teams". */
function paidExtras(options: PricingOptions, analytics: string): string {
  return listNames(
    [
      "unlimited dynamic codes",
      analytics,
      ...(offered(options, "customDomains") ? ["custom domains"] : []),
      "teams",
    ],
    "and",
  );
}

/** The pricing page's intro line, under its title. */
export function buildPricingIntro(options: PricingOptions = {}): string {
  return `Static QR codes are free forever. Paid plans add ${paidExtras(options, "longer analytics")}.`;
}

/** The pricing page's meta description (and its JSON-LD). */
export function buildPricingDescription(options: PricingOptions = {}): string {
  const usd = (plan: PaidPlan) =>
    formatPrice(PRICING[plan].month.amounts.USD, "USD");
  return `Static QR codes are free forever. Pro (${usd("pro")}/mo) and Business (${usd("business")}/mo) add ${paidExtras(options, "analytics history")}. Codes keep working if you cancel.`;
}

/**
 * The upgrade dialog's headline features (components/get-pro-dialog.tsx, a
 * client component that can't read lib/plans); the pricing page lists every
 * limit.
 */
export function buildUpgradeHighlights(
  options: Pick<PricingOptions, "customDomains"> = {},
): Record<PaidPlan, string[]> {
  const domains = offered(options, "customDomains");
  return {
    pro: [
      "Unlimited dynamic codes and landing pages",
      "3 years of analytics history",
      domains ? "5 custom domains and teams of up to 3" : "Teams of up to 3",
      "Unlimited saved themes, shared with your team",
      "Smart routing, A/B tests, UTM tags and pixels",
    ],
    business: [
      "Everything in Pro",
      "White-label pages with custom CSS",
      domains
        ? "25 custom domains and unlimited team members"
        : "Unlimited team members",
      "Conversion tracking and webhooks",
    ],
  };
}

/** Short feature lists for the plan cards. */
export function buildHighlights(
  limits: PlanLimitsByPlan,
  options: PricingOptions = {},
): Record<Plan, string[]> {
  const { free, pro, business } = limits;
  const aiArt = offered(options, "aiArt");
  const domains = offered(options, "customDomains");
  const storage = offered(options, "fileStorage");
  return {
    free: [
      "Unlimited static QR codes, no account needed",
      `${formatCount(free.dynamicCodes)} dynamic QR codes with scan analytics`,
      "Unlimited scans, never paused, no ads",
      `${formatCount(free.landingPages)} hosted landing pages`,
      `${formatDays(free.analyticsRetentionDays)} of analytics history`,
      ...(storage ? [`${formatBytes(free.storageBytes)} of file storage`] : []),
    ],
    pro: [
      "Unlimited dynamic codes and landing pages",
      `${formatDays(pro.analyticsRetentionDays)} of analytics history`,
      ...(domains ? [`${formatCount(pro.customDomains)} custom domains`] : []),
      `Teams of up to ${formatCount(pro.teamMembers)} people`,
      pro.teamThemes
        ? "Unlimited saved themes, shared with your team"
        : "Unlimited saved themes",
      "Smart routing, A/B tests, UTM tags and pixels",
      "Passwords, schedules, expiry and scan limits",
      storageAndForms(pro, storage),
    ],
    business: [
      "White-label pages with custom CSS",
      `${formatDays(business.analyticsRetentionDays)} analytics history`,
      ...(domains
        ? [`${formatCount(business.customDomains)} custom domains`]
        : []),
      "Unlimited team members",
      ...(business.sso ? ["Single sign-on (SAML and OIDC)"] : []),
      "Conversion tracking",
      "Webhooks, Zapier and Slack",
      storageAndForms(business, storage),
      ...(aiArt
        ? [
            `${formatCount(business.aiArtPerMonth)} AI art images a month, pooled per team`,
          ]
        : []),
    ],
  };
}
