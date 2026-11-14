// Pricing-page copy derived from the plan limits (lib/plans.ts is the single
// source of truth), in any language: the words come from the catalog
// (messages/<locale>.json, "pricing"), the numbers from the limits. Every
// builder takes the copy last and defaults to English, which the agent
// Markdown (lib/agents) and the tests use. Server-side: it loads the
// English catalog. Client components import ./savings or
// ./upgrade-highlights instead.

import { AI_REQUEST_FREE_TIER_LIMIT } from "@repo/config";
import type { Locale } from "@repo/i18n/config";
import { createTranslator } from "next-intl";
import { AUDIT_RETENTION_DAYS } from "@/ee/audit-log/limits";
import { listNames } from "@/lib/availability-copy";
import type { Messages } from "@/lib/i18n/messages";
import type { PlanLimits } from "@/lib/plans";
import {
  formatPrice,
  type PaidPlan,
  type Plan,
  PRICING,
  type PricingCurrency,
} from "@/lib/pricing";
import en from "@/messages/en.json";

export { maxYearlySavingsPercent, yearlySavingsPercent } from "./savings";
export { buildUpgradeHighlights } from "./upgrade-highlights";

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

/** The catalog's "pricing" namespace in one language. */
export interface PricingCopy {
  locale: Locale;
  t: ReturnType<typeof createTranslator<Messages, "pricing">>;
}

/** Copy for `locale` from a loaded catalog (getMessages() on the server). */
export function pricingCopy(locale: Locale, messages: Messages): PricingCopy {
  return {
    locale,
    t: createTranslator({ locale, messages, namespace: "pricing" }),
  };
}

let english: PricingCopy | undefined;
/** The English copy: the default for every builder here. */
export const englishPricingCopy = (): PricingCopy => {
  english ??= pricingCopy("en", en);
  return english;
};
const englishCopy = englishPricingCopy;

const isEnglish = (copy: PricingCopy) => copy.locale === "en";

// Only built features are sold: planned limits in lib/plans.ts (folder
// permissions) stay off the pricing page until they ship. The audit log
// shipped (ee/audit-log), so it's listed on Business where it's available.

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** "1,000" (in the page's number format), or "Unlimited". */
export function formatCount(value: number, copy = englishCopy()): string {
  if (!Number.isFinite(value)) return copy.t("values.unlimited");
  return new Intl.NumberFormat(isEnglish(copy) ? "en-US" : copy.locale).format(
    value,
  );
}

export function formatBytes(bytes: number, copy = englishCopy()): string {
  if (!Number.isFinite(bytes)) return copy.t("values.unlimited");
  if (bytes >= GB) {
    return copy.t("values.gigabytes", { count: formatCount(bytes / GB, copy) });
  }
  return copy.t("values.megabytes", {
    count: formatCount(Math.round(bytes / MB), copy),
  });
}

export function formatDays(days: number, copy = englishCopy()): string {
  if (!Number.isFinite(days)) return copy.t("values.unlimited");
  if (days % 365 === 0) return copy.t("values.years", { count: days / 365 });
  return copy.t("values.days", { count: days });
}

/** "a, b and c": the English list style as before, Intl's elsewhere. */
function joinList(items: string[], copy: PricingCopy): string {
  if (isEnglish(copy)) return listNames(items, "and");
  return new Intl.ListFormat(copy.locale, { type: "conjunction" }).format(
    items,
  );
}

const PLANS: readonly Plan[] = ["free", "pro", "business"];

type RowKey = keyof Messages["pricing"]["comparison"]["rows"];
type RowId = Exclude<RowKey, `${string}Hint`>;
type HintId = Extract<RowKey, `${string}Hint`>;

interface RowSpec {
  id: RowId;
  hint?: HintId;
  value: (limits: PlanLimits, plan: Plan, copy: PricingCopy) => CellValue;
  /** Left out where this deployment can't offer the feature. */
  feature?: keyof PricingOptions;
}

/** A plan flag: true when the plan includes every key. */
function flag(...keys: (keyof PlanLimits)[]) {
  return (limits: PlanLimits): CellValue =>
    keys.every((key) => Boolean(limits[key]));
}

function landingPages(limits: PlanLimits, _: Plan, copy: PricingCopy): string {
  const count = formatCount(limits.landingPages, copy);
  if (limits.landingPageBadge) {
    return copy.t("comparison.cells.pagesWithBadge", { count });
  }
  if (limits.whiteLabel && limits.customCss) {
    return copy.t("comparison.cells.pagesWhiteLabelCss", { count });
  }
  if (limits.whiteLabel) {
    return copy.t("comparison.cells.pagesWhiteLabel", { count });
  }
  return copy.t("comparison.cells.pagesNoFooter", { count });
}

// Every scan is kept at full detail for the whole history: nothing rolls raw
// scans up into daily totals yet, so the copy must not promise that.
function analyticsHistory(
  limits: PlanLimits,
  _: Plan,
  copy: PricingCopy,
): string {
  return formatDays(limits.analyticsRetentionDays, copy);
}

/** "1 year of analytics history", or "Unlimited analytics history". */
function historyHighlight(days: number, copy: PricingCopy): string {
  const duration = formatDays(days, copy);
  return Number.isFinite(days)
    ? copy.t("highlights.historyOf", { duration })
    : copy.t("highlights.history", { duration });
}

function teamMembers(limits: PlanLimits, _: Plan, copy: PricingCopy): string {
  if (!limits.teams) return copy.t("comparison.cells.noTeams");
  return formatCount(limits.teamMembers, copy);
}

const unlimited = (_: PlanLimits, __: Plan, copy: PricingCopy) =>
  copy.t("values.unlimited");

/** Hint for the pixels row: product names, never translated. */
const PIXELS_HINT = "GA4, Meta, GTM, TikTok";
// Tag Manager only loads on custom domains (components/landing/pixels.tsx).
const PIXELS_HINT_WITHOUT_GTM = "GA4, Meta, TikTok, LinkedIn";

const GROUPS: {
  title: keyof Messages["pricing"]["comparison"]["groups"];
  rows: RowSpec[];
}[] = [
  {
    title: "codes",
    rows: [
      { id: "staticCodes", hint: "staticCodesHint", value: unlimited },
      {
        id: "dynamicCodes",
        value: (l, _, copy) => formatCount(l.dynamicCodes, copy),
      },
      { id: "scans", hint: "scansHint", value: unlimited },
      { id: "landingPages", value: landingPages },
      {
        id: "savedThemes",
        value: (l, _, copy) =>
          l.teamThemes
            ? copy.t("comparison.cells.themesShared", {
                count: formatCount(l.savedThemes, copy),
              })
            : formatCount(l.savedThemes, copy),
      },
      {
        id: "aiThemes",
        feature: "aiThemes",
        value: (_, plan, copy) =>
          plan === "free"
            ? copy.t("comparison.cells.aiThemesTotal", {
                count: formatCount(AI_REQUEST_FREE_TIER_LIMIT, copy),
              })
            : copy.t("values.unlimited"),
      },
      {
        id: "aiArt",
        feature: "aiArt",
        value: (l, _, copy) =>
          l.aiArtPooled
            ? copy.t("comparison.cells.aiArtPooled", {
                count: formatCount(l.aiArtPerMonth, copy),
              })
            : formatCount(l.aiArtPerMonth, copy),
      },
    ],
  },
  {
    title: "analytics",
    rows: [
      { id: "analyticsHistory", value: analyticsHistory },
      { id: "routing", hint: "routingHint", value: flag("routing") },
      {
        id: "preciseLocation",
        hint: "preciseLocationHint",
        value: flag("preciseLocation"),
      },
      { id: "linkControls", value: flag("linkControls") },
      { id: "pixels", value: flag("pixels") },
      { id: "conversions", value: flag("conversions") },
    ],
  },
  {
    title: "brand",
    rows: [
      {
        id: "customDomains",
        feature: "customDomains",
        value: (l, _, copy) =>
          l.customDomains > 0 ? formatCount(l.customDomains, copy) : false,
      },
      {
        id: "customSlugs",
        hint: "customSlugsHint",
        value: flag("customSlugs"),
      },
      { id: "teamMembers", value: teamMembers },
      { id: "sso", hint: "ssoHint", feature: "sso", value: flag("sso") },
      {
        id: "auditLog",
        hint: "auditLogHint",
        feature: "auditLog",
        value: flag("auditLog"),
      },
    ],
  },
  // Agency tools (feat/agency-tools)
  {
    title: "agency",
    rows: [
      {
        id: "clientReports",
        hint: "clientReportsHint",
        value: (l, _, copy) =>
          l.clientReports
            ? copy.t(
                l.clientReportsWhiteLabel
                  ? "comparison.cells.clientReportsWhiteLabel"
                  : "comparison.cells.clientReportsBadge",
              )
            : false,
      },
      {
        id: "clientPortal",
        hint: "clientPortalHint",
        value: flag("clientPortal"),
      },
      {
        id: "invoiceBilling",
        feature: "invoiceRequests",
        value: flag("invoiceBilling"),
      },
    ],
  },
  {
    title: "files",
    rows: [
      {
        id: "fileStorage",
        feature: "fileStorage",
        value: (l, _, copy) =>
          copy.t("comparison.cells.storage", {
            size: formatBytes(l.storageBytes, copy),
            perFile: formatBytes(l.maxFileBytes, copy),
          }),
      },
      {
        id: "formResponses",
        value: (l, _, copy) => formatCount(l.formResponsesPerMonth, copy),
      },
    ],
  },
  {
    title: "automation",
    rows: [
      {
        id: "emailAlerts",
        feature: "emailAlerts",
        value: flag("emailAlerts"),
      },
      { id: "webhooks", value: flag("webhooks") },
      {
        id: "apiRequests",
        value: (l, _, copy) =>
          l.bulkApi
            ? copy.t("comparison.cells.apiBulk", {
                count: formatCount(l.apiRequestsPerDay, copy),
              })
            : formatCount(l.apiRequestsPerDay, copy),
      },
    ],
  },
];

/** The price row for the comparison table, in one display currency. */
export function priceRow(
  currency: PricingCurrency,
  copy = englishCopy(),
): ComparisonRow {
  const price = (amount: number) => formatPrice(amount, currency, copy.locale);
  const paid = (plan: PaidPlan) =>
    copy.t("comparison.cells.pricePaid", {
      monthly: price(PRICING[plan].month.amounts[currency]),
      yearly: price(PRICING[plan].year.amounts[currency]),
    });
  return {
    feature: copy.t("comparison.rows.price"),
    values: {
      free: price(0),
      pro: paid("pro"),
      business: paid("business"),
    },
  };
}

/**
 * What this deployment can offer (packages/availability/rules.ts): rows
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
  /** Workspace single sign-on (QRDX_EE_LICENSE). */
  sso?: boolean;
  /** The workspace audit log (QRDX_EE_LICENSE). */
  auditLog?: boolean;
  /** Pay-by-invoice requests (qrdx.dev with email; agency tools). */
  invoiceRequests?: boolean;
}

const offered = (options: PricingOptions, feature?: keyof PricingOptions) =>
  !feature || options[feature] !== false;

function rowHint(
  spec: RowSpec,
  options: PricingOptions,
  copy: PricingCopy,
): string | undefined {
  if (spec.id === "pixels") {
    return offered(options, "customDomains")
      ? PIXELS_HINT
      : PIXELS_HINT_WITHOUT_GTM;
  }
  if (!spec.hint) return undefined;
  return spec.hint === "auditLogHint"
    ? copy.t("comparison.rows.auditLogHint", { days: AUDIT_RETENTION_DAYS })
    : copy.t(`comparison.rows.${spec.hint}`);
}

export function buildComparison(
  limits: PlanLimitsByPlan,
  currency: PricingCurrency,
  options: PricingOptions = {},
  copy = englishCopy(),
): ComparisonGroup[] {
  return [
    {
      title: copy.t("comparison.groups.price"),
      rows: [priceRow(currency, copy)],
    },
    ...GROUPS.map((group) => ({
      title: copy.t(`comparison.groups.${group.title}`),
      rows: group.rows
        .filter((spec) => offered(options, spec.feature))
        .map((spec) => {
          const hint = rowHint(spec, options, copy);
          return {
            feature: copy.t(`comparison.rows.${spec.id}`),
            ...(hint && { hint }),
            values: Object.fromEntries(
              PLANS.map((plan) => [plan, spec.value(limits[plan], plan, copy)]),
            ) as Record<Plan, CellValue>,
          };
        }),
    })),
  ].filter((group) => group.rows.length > 0);
}

/** "5 GB storage, 1,000 form responses a month", without storage when off. */
function storageAndForms(
  limits: PlanLimits,
  fileStorage: boolean,
  copy: PricingCopy,
): string {
  const count = formatCount(limits.formResponsesPerMonth, copy);
  return fileStorage
    ? copy.t("highlights.storageAndForms", {
        size: formatBytes(limits.storageBytes, copy),
        count,
      })
    : copy.t("highlights.forms", { count });
}

/** What paid plans add, in a list: "unlimited dynamic codes, …, and teams". */
function paidExtras(
  options: PricingOptions,
  analytics: "longerAnalytics" | "analyticsHistory",
  copy: PricingCopy,
): string {
  return joinList(
    [
      copy.t("extras.unlimitedDynamic"),
      copy.t(`extras.${analytics}`),
      ...(offered(options, "customDomains")
        ? [copy.t("extras.customDomains")]
        : []),
      copy.t("extras.teams"),
    ],
    copy,
  );
}

/** The pricing page's intro line, under its title. */
export function buildPricingIntro(
  options: PricingOptions = {},
  copy = englishCopy(),
): string {
  return copy.t("header.intro", {
    extras: paidExtras(options, "longerAnalytics", copy),
  });
}

/** The pricing page's meta description (and its JSON-LD). */
export function buildPricingDescription(
  options: PricingOptions = {},
  copy = englishCopy(),
): string {
  const usd = (plan: PaidPlan) =>
    formatPrice(PRICING[plan].month.amounts.USD, "USD", copy.locale);
  return copy.t("meta.description", {
    pro: usd("pro"),
    business: usd("business"),
    extras: paidExtras(options, "analyticsHistory", copy),
  });
}

/** Short feature lists for the plan cards. */
export function buildHighlights(
  limits: PlanLimitsByPlan,
  options: PricingOptions = {},
  copy = englishCopy(),
): Record<Plan, string[]> {
  const { free, pro, business } = limits;
  const { t } = copy;
  const count = (value: number) => formatCount(value, copy);
  const aiArt = offered(options, "aiArt");
  const domains = offered(options, "customDomains");
  const storage = offered(options, "fileStorage");
  return {
    free: [
      t("highlights.unlimitedStatic"),
      t("highlights.dynamicWithAnalytics", { count: count(free.dynamicCodes) }),
      t("highlights.unlimitedScans"),
      t("highlights.landingPages", { count: count(free.landingPages) }),
      historyHighlight(free.analyticsRetentionDays, copy),
      ...(storage
        ? [
            t("highlights.fileStorage", {
              size: formatBytes(free.storageBytes, copy),
            }),
          ]
        : []),
    ],
    pro: [
      t("highlights.unlimitedDynamic"),
      historyHighlight(pro.analyticsRetentionDays, copy),
      ...(domains
        ? [t("highlights.customDomains", { count: count(pro.customDomains) })]
        : []),
      t("highlights.teams", { count: count(pro.teamMembers) }),
      pro.teamThemes ? t("highlights.themesShared") : t("highlights.themes"),
      t("highlights.routing"),
      t("highlights.linkControls"),
      ...(pro.clientReports ? [t("highlights.clientReports")] : []),
      storageAndForms(pro, storage, copy),
    ],
    business: [
      t("highlights.whiteLabel"),
      // The card starts "Everything in Pro": only a longer history is news.
      ...(business.analyticsRetentionDays > pro.analyticsRetentionDays
        ? [historyHighlight(business.analyticsRetentionDays, copy)]
        : []),
      ...(domains
        ? [
            t("highlights.customDomains", {
              count: count(business.customDomains),
            }),
          ]
        : []),
      t("highlights.unlimitedTeam"),
      ...(business.sso && offered(options, "sso") ? [t("highlights.sso")] : []),
      ...(business.auditLog && offered(options, "auditLog")
        ? [t("highlights.auditLog")]
        : []),
      t("highlights.conversions"),
      t("highlights.webhooks"),
      ...(business.clientPortal && business.clientReportsWhiteLabel
        ? [t("highlights.clientWork")]
        : []),
      ...(business.invoiceBilling && offered(options, "invoiceRequests")
        ? [t("highlights.invoiceBilling")]
        : []),
      storageAndForms(business, storage, copy),
      ...(aiArt
        ? [t("highlights.aiArt", { count: count(business.aiArtPerMonth) })]
        : []),
    ],
  };
}
