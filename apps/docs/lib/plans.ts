import "server-only";

import { database as db, member } from "@repo/database";
import { and, eq, like } from "drizzle-orm";
import { cache } from "react";
import { MAX_FREE_THEMES } from "./constants";
import { type Plan, planForProductId } from "./pricing";
import { getMyActiveSubscription } from "./subscription";

/**
 * Plans and their limits — the single source of truth for feature gating
 * (prices and display names live in the client-safe lib/pricing.ts).
 *
 * Never-Hostage Guarantee: limits only block creating new things. Existing
 * dynamic codes keep redirecting on every plan, including after a downgrade,
 * a failed payment or a cancellation; scans are unlimited and never paused.
 */
export type { Plan };

export const PLANS: readonly Plan[] = ["free", "pro", "business"];

/** Use `Number.isFinite(limit)` to tell a cap from "unlimited". */
export const UNLIMITED = Number.POSITIVE_INFINITY;

const MB = 1024 * 1024;
const GB = 1024 * MB;

export interface PlanLimits {
  /** Active (non-archived) dynamic QR codes per scope */
  dynamicCodes: number;
  /** Hosted landing pages per scope */
  landingPages: number;
  /** Hosted pages show a "Made with QRdx" footer */
  landingPageBadge: boolean;
  /** No QRdx branding on hosted pages */
  whiteLabel: boolean;
  /** Custom CSS on hosted pages */
  customCss: boolean;
  /** Total bytes of uploaded files per scope */
  storageBytes: number;
  /** Largest single upload, in bytes */
  maxFileBytes: number;
  /** How far back scan analytics can be queried */
  analyticsRetentionDays: number;
  /** Raw scans older than this may be rolled up into daily counts */
  rawScanRetentionDays: number;
  customDomains: number;
  /** May create teams (organizations) */
  teams: boolean;
  /** Members per team, owner included */
  teamMembers: number;
  /** Per-folder access rules for team members */
  folderPermissions: boolean;
  auditLog: boolean;
  /** Password, start/expiry dates and scan limits (lib/redirect/lifecycle.ts) */
  linkControls: boolean;
  /** Device/geo/time/language rules, A/B splits and UTM (lib/redirect/routing.ts) */
  routing: boolean;
  /** Retargeting pixels */
  pixels: boolean;
  /** Conversion tracking */
  conversions: boolean;
  /** Email digests and alerts */
  emailAlerts: boolean;
  /** Webhooks, Zapier and Slack/Discord notifications */
  webhooks: boolean;
  /** Form submissions accepted per calendar month across hosted pages */
  formResponsesPerMonth: number;
  /** REST API requests per day */
  apiRequestsPerDay: number;
  /** May create dynamic codes in bulk via the REST API */
  bulkApi: boolean;
  /** AI QR art images per calendar month */
  aiArtPerMonth: number;
  /** The AI art quota is shared by the whole team */
  aiArtPooled: boolean;
  savedThemes: number;
  /** Saved themes can be shared with a team */
  teamThemes: boolean;
  /** @deprecated Brand kits are merged into saved themes; use `savedThemes`. */
  brandKits: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    dynamicCodes: 10,
    landingPages: 3,
    landingPageBadge: true,
    whiteLabel: false,
    customCss: false,
    storageBytes: 50 * MB,
    maxFileBytes: 10 * MB,
    analyticsRetentionDays: 90,
    rawScanRetentionDays: 90,
    customDomains: 0,
    teams: false,
    teamMembers: 1,
    folderPermissions: false,
    auditLog: false,
    linkControls: false,
    routing: false,
    pixels: false,
    conversions: false,
    emailAlerts: false,
    webhooks: false,
    formResponsesPerMonth: 50,
    apiRequestsPerDay: 1000,
    bulkApi: false,
    aiArtPerMonth: 3,
    aiArtPooled: false,
    savedThemes: MAX_FREE_THEMES,
    teamThemes: false,
    brandKits: 1,
  },
  pro: {
    dynamicCodes: UNLIMITED,
    landingPages: UNLIMITED,
    landingPageBadge: false,
    whiteLabel: false,
    customCss: false,
    storageBytes: 5 * GB,
    maxFileBytes: 100 * MB,
    analyticsRetentionDays: 3 * 365,
    rawScanRetentionDays: 3 * 365,
    customDomains: 5,
    teams: true,
    teamMembers: 3,
    folderPermissions: false,
    auditLog: false,
    linkControls: true,
    routing: true,
    pixels: true,
    conversions: false,
    emailAlerts: true,
    webhooks: false,
    formResponsesPerMonth: 1000,
    apiRequestsPerDay: 10_000,
    bulkApi: true,
    aiArtPerMonth: 30,
    aiArtPooled: false,
    savedThemes: UNLIMITED,
    // Pro includes 3-member teams; shared themes are what make them useful.
    teamThemes: true,
    brandKits: UNLIMITED,
  },
  business: {
    dynamicCodes: UNLIMITED,
    landingPages: UNLIMITED,
    landingPageBadge: false,
    whiteLabel: true,
    customCss: true,
    storageBytes: 50 * GB,
    maxFileBytes: 250 * MB,
    analyticsRetentionDays: UNLIMITED,
    // ~13 months raw, daily rollups after that
    rawScanRetentionDays: 395,
    customDomains: 25,
    teams: true,
    teamMembers: UNLIMITED,
    folderPermissions: true,
    auditLog: true,
    linkControls: true,
    routing: true,
    pixels: true,
    conversions: true,
    emailAlerts: true,
    webhooks: true,
    formResponsesPerMonth: 10_000,
    apiRequestsPerDay: 100_000,
    bulkApi: true,
    aiArtPerMonth: 150,
    aiArtPooled: true,
    savedThemes: UNLIMITED,
    teamThemes: true,
    brandKits: UNLIMITED,
  },
};

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

const PLAN_RANK: Record<Plan, number> = { free: 0, pro: 1, business: 2 };

/** The most generous of several plans (free for none). */
export function highestPlan(plans: Iterable<Plan>): Plan {
  let best: Plan = "free";
  for (const plan of plans) {
    if (PLAN_RANK[plan] > PLAN_RANK[best]) best = plan;
  }
  return best;
}

/**
 * Plan granted by an entitled subscription to `productId`. Products not in
 * the configured env ids (renamed, legacy, ...) count as Pro.
 */
export function planForSubscriptionProduct(productId: string): Plan {
  return planForProductId(productId) ?? "pro";
}

/** A user's own plan, from their entitled Polar subscription. */
export const getPlan = cache(async (userId: string): Promise<Plan> => {
  const subscription = await getMyActiveSubscription(userId);
  return subscription
    ? planForSubscriptionProduct(subscription.productId)
    : "free";
});

const hasOwnerRole = (role: string) =>
  role
    .split(",")
    .map((r) => r.trim())
    .includes("owner");

/**
 * Plan for resources owned by an organization: the best plan among its
 * owners. An organization without owners falls back to Free.
 */
export const getOwnerPlanForOrganization = cache(
  async (organizationId: string): Promise<Plan> => {
    const owners = await db
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          like(member.role, "%owner%"),
        ),
      );

    const plans = await Promise.all(
      owners.filter((m) => hasOwnerRole(m.role)).map((m) => getPlan(m.userId)),
    );
    return highestPlan(plans);
  },
);

/** Plan that governs a personal or team scope (see lib/scope). */
export function getPlanForScope(scope: {
  userId: string;
  organizationId: string | null;
}): Promise<Plan> {
  return scope.organizationId
    ? getOwnerPlanForOrganization(scope.organizationId)
    : getPlan(scope.userId);
}
