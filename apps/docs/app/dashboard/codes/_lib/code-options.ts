// The power options of a dynamic code (UTM, routing, A/B tests, password,
// schedule, pixels or conversions): which ones a code offers, the plans that
// unlock each one and whether a code has it set up. Client-safe and pure: the
// plan limits come in as an argument (lib/plans.ts is server-only, see
// code-option-plans.ts), so the builder and the code page never hard-code a
// plan name.

import type { PaidPlan, Plan } from "@/lib/pricing";
import { PLAN_NAMES } from "@/lib/pricing";
import type {
  PixelConfig,
  RoutingConfig,
  UtmConfig,
} from "@/lib/redirect/routing";

export const CODE_OPTION_IDS = [
  "utm",
  "routing",
  "ab",
  "password",
  "schedule",
  "pixels",
  "conversions",
] as const;

export type CodeOptionId = (typeof CODE_OPTION_IDS)[number];

export type CodeKind = "redirect" | "page";

/** Plan limits (lib/plans.ts PlanLimits) that unlock an option. */
export type CodeOptionLimit =
  | "routing"
  | "linkControls"
  | "pixels"
  | "conversions";

/**
 * The limit each option needs, matching the server actions that save it
 * (actions/code-marketing.ts gates UTM on `routing`; actions/code-lifecycle.ts
 * gates password and dates on `linkControls`).
 */
export const CODE_OPTION_LIMITS: Record<CodeOptionId, CodeOptionLimit> = {
  utm: "routing",
  routing: "routing",
  ab: "routing",
  password: "linkControls",
  schedule: "linkControls",
  pixels: "pixels",
  conversions: "conversions",
};

/**
 * Where each option's panel lives on the code page's Settings tab. Options
 * that share a panel share its anchor.
 */
export const CODE_OPTION_ANCHORS: Record<CodeOptionId, string> = {
  utm: "utm",
  routing: "routing",
  ab: "routing",
  password: "access",
  schedule: "access",
  pixels: "tracking",
  conversions: "tracking",
};

export interface CodeOptionCopy {
  /** Button label, 1-2 words */
  label: string;
  /** What it does, a few words under the label */
  blurb: string;
  /** One sentence for the upgrade prompt when no code exists yet */
  summary: string;
}

export const CODE_OPTION_COPY: Record<CodeOptionId, CodeOptionCopy> = {
  utm: {
    label: "UTM",
    blurb: "Tag scans for analytics",
    summary:
      "UTM parameters tag every scan for Google Analytics and other tools.",
  },
  routing: {
    label: "Routing",
    blurb: "By device, country, time",
    summary:
      "Smart routing sends each scan by device, country, language or time.",
  },
  ab: {
    label: "A/B test",
    blurb: "Split scans across URLs",
    summary: "A/B tests split scans between two or more destinations.",
  },
  password: {
    label: "Password",
    blurb: "Ask for a password",
    summary:
      "A password keeps the destination private until a visitor enters it.",
  },
  schedule: {
    label: "Schedule",
    blurb: "Start and end dates",
    summary: "A schedule turns the code on and off on the dates you pick.",
  },
  pixels: {
    label: "Pixels",
    blurb: "Load your ad pixels",
    summary: "Tracking pixels load your analytics and ad tags on the page.",
  },
  conversions: {
    label: "Conversions",
    blurb: "Attribute sales to scans",
    summary: "Conversion tracking attributes sales on your website to scans.",
  },
};

/**
 * The options a code of `kind` offers, in builder order. Hosted pages don't
 * redirect, so they have nothing to route or tag; website links open the
 * destination directly, so pixels belong on that site and the code offers
 * conversion tracking instead.
 */
export function codeOptionsFor(kind: CodeKind): CodeOptionId[] {
  return kind === "page"
    ? ["password", "schedule", "pixels"]
    : ["utm", "routing", "ab", "password", "schedule", "conversions"];
}

export interface CodeOptionAccess {
  /** Plans that include the option, in plan order (free first) */
  plans: Plan[];
  /** The cheapest paid plan that unlocks it; null when every plan has it */
  requiredPlan: PaidPlan | null;
  /** The active workspace's plan includes it */
  included: boolean;
}

/**
 * Plans for the code dialog's other gates (cap, custom domain, back-half),
 * so its copy names them from the limits table too.
 */
export interface CodeUpgradePlans {
  /** The cheapest plan with no cap on active dynamic codes */
  unlimitedCodes: Plan | null;
  /** Plans that let codes use a custom domain, cheapest first */
  customDomains: Plan[];
  /** Plans that let codes choose their back-half, cheapest first */
  customSlugs: Plan[];
}

export interface CodeOptionPlans {
  /** The active workspace's plan */
  plan: Plan;
  options: Record<CodeOptionId, CodeOptionAccess>;
  upgrades: CodeUpgradePlans;
}

/** The limits (lib/plans.ts PlanLimits) these plans are read from. */
type LimitTable = Record<
  Plan,
  Record<CodeOptionLimit, boolean> & {
    dynamicCodes: number;
    customDomains: number;
    customSlugs: boolean;
  }
>;

/** Which plans unlock each option, from the plan limits table. */
export function resolveCodeOptionPlans(
  limits: LimitTable,
  order: readonly Plan[],
  current: Plan,
): CodeOptionPlans {
  const options = {} as Record<CodeOptionId, CodeOptionAccess>;
  for (const id of CODE_OPTION_IDS) {
    const key = CODE_OPTION_LIMITS[id];
    const plans = order.filter((plan) => limits[plan][key]);
    const first = plans[0];
    options[id] = {
      plans,
      requiredPlan: first === undefined || first === "free" ? null : first,
      included: limits[current][key],
    };
  }
  const upgrades: CodeUpgradePlans = {
    unlimitedCodes:
      order.find((plan) => !Number.isFinite(limits[plan].dynamicCodes)) ?? null,
    customDomains: order.filter((plan) => limits[plan].customDomains > 0),
    customSlugs: order.filter((plan) => limits[plan].customSlugs),
  };
  return { plan: current, options, upgrades };
}

/** "Pro", "Pro and Business", "Free, Pro and Business". */
export function formatPlanList(plans: readonly Plan[]): string {
  const names = plans.map((plan) => PLAN_NAMES[plan]);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The fields of a code's settings that decide which options are on. */
export interface CodeOptionState {
  routing: Pick<RoutingConfig, "rules"> | null;
  utm: Partial<UtmConfig> | null;
  pixels: Partial<PixelConfig> | null;
}

export interface CodeLifecycleState {
  hasPassword: boolean;
  startsAt: string | null;
  expiresAt: string | null;
}

const UTM_FIELDS = ["source", "medium", "campaign", "term", "content"] as const;
const PIXEL_IDS = ["ga4", "gtm", "meta", "tiktok", "linkedin"] as const;

/**
 * Which options a code has set up. Settings that are saved but switched off
 * (a disabled rule) don't count. Missing inputs count as not set up.
 */
export function codeOptionStatus(
  marketing: CodeOptionState | null,
  lifecycle: CodeLifecycleState | null,
): Record<CodeOptionId, boolean> {
  const rules = (marketing?.routing?.rules ?? []).filter(
    (rule) => rule.enabled,
  );
  const utm = marketing?.utm;
  const pixels = marketing?.pixels;
  return {
    utm: Boolean(
      utm &&
        (UTM_FIELDS.some((field) => utm[field]) ||
          (utm.params?.length ?? 0) > 0),
    ),
    routing: rules.some((rule) => rule.action.type === "redirect"),
    ab: rules.some((rule) => rule.action.type === "split"),
    password: Boolean(lifecycle?.hasPassword),
    schedule: Boolean(lifecycle?.startsAt || lifecycle?.expiresAt),
    pixels: Boolean(pixels && PIXEL_IDS.some((id) => pixels[id])),
    conversions: Boolean(pixels?.conversions),
  };
}
