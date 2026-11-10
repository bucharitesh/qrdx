import "server-only";

import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import { database as db } from "@repo/database";
import { subscription as subscriptionTable } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { getCodeUsage } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getDomainsOverview } from "@/app/(app)/dashboard/domains/_lib/domains";
import { getPageUsage } from "@/app/(app)/dashboard/pages/_lib/landing-pages";
import {
  getTeam,
  listPendingInvitations,
  listTeamMembers,
} from "@/app/(app)/dashboard/team/_lib/queries";
import { countThemesInScope } from "@/app/(app)/dashboard/themes/_lib/queries";
import { getFormResponseUsage } from "@/app/api/forms/_lib/responses";
import { getArtCredits } from "@/lib/ai/art";
import { getCheckoutOpen } from "@/lib/checkout-availability";
import { AI_REQUEST_FREE_TIER_LIMIT } from "@/lib/constants";
import {
  getCustomDomainMode,
  isFeatureAvailable,
} from "@/lib/feature-availability";
import { getStorageOverview } from "@/lib/files/service";
import { formatBytes } from "@/lib/files/types";
import { listOAuthApps } from "@/lib/oauth-apps/service";
import { can } from "@/lib/permissions";
import {
  getPlan,
  getPlanForScope,
  getPlanLimits,
  PLAN_LIMITS,
  type Plan,
  planForSubscriptionProduct,
} from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import {
  getMyActiveSubscription,
  validateSubscriptionAndUsage,
} from "@/lib/subscription";
import {
  aiArtNote,
  type CheckoutOpen,
  type Meter,
  type MeterCaps,
  type MeterId,
  type MeterResult,
  meterLabel,
  resolveMeterCaps,
  type SubscriptionSummary,
} from "./meters";

export type { MeterResult } from "./meters";

export interface PlanUsage {
  plan: Plan;
  /** isTeam: not the viewer's own workspace (its plan is its owners') */
  workspace: { isTeam: boolean; name: string };
  /** An owner or billing member (they pay for the workspace's plan). */
  canChangePlan: boolean;
  /** The signed-in person's own subscription (null when they have none). */
  subscription: SubscriptionSummary | null;
  /**
   * They have paid before (any subscription, even canceled or past due), so
   * the billing portal has their invoices and payment method.
   */
  hasBillingHistory: boolean;
  meters: MeterResult[];
  /** Each meter's cap and the plan that lifts it, for limit cards */
  caps: MeterCaps;
  /** Paid plans checkout can sell here right now */
  checkoutOpen: CheckoutOpen;
}

/**
 * The caps of a workspace on `plan`, and which plan lifts each. AI theme
 * requests follow the person's own subscription: a one-time allowance on
 * Free, none once they pay.
 */
export function meterCapsFor(
  plan: Plan,
  { isTeam, personalPlan }: { isTeam: boolean; personalPlan: Plan },
): MeterCaps {
  return {
    ...resolveMeterCaps(PLAN_LIMITS, plan, { isTeam }),
    aiThemes:
      personalPlan === "free"
        ? {
            limit: AI_REQUEST_FREE_TIER_LIMIT,
            lift: { plan: "pro", limit: null },
          }
        : { limit: null, lift: null },
  };
}

const finite = (value: number) => (Number.isFinite(value) ? value : null);

async function hasAnySubscription(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: subscriptionTable.id })
    .from(subscriptionTable)
    .where(eq(subscriptionTable.userId, userId))
    .limit(1);
  return Boolean(row);
}

/**
 * Every limit this workspace's plan sets that can be counted here, with the
 * real count, and the subscription details Plan & usage shows.
 */
export async function getPlanUsage(scope: ActiveScope): Promise<PlanUsage> {
  const isTeam = !isOwnWorkspaceOf(scope.organizationId, scope.userId);
  const [usage, own, team, billingHistory] = await Promise.all([
    getUsageMeters(scope),
    getMyActiveSubscription(scope.userId),
    getTeam(scope.organizationId),
    hasAnySubscription(scope.userId),
  ]);

  return {
    plan: usage.plan,
    workspace: {
      isTeam,
      name: team?.name ?? "This workspace",
    },
    canChangePlan: can(scope.role, "billing.manage"),
    subscription: own
      ? {
          plan: planForSubscriptionProduct(own.productId),
          status: own.status,
          interval: own.recurringInterval,
          currentPeriodEnd: own.currentPeriodEnd.toISOString(),
          cancelAtPeriodEnd: own.cancelAtPeriodEnd,
          endsAt: own.endsAt ? own.endsAt.toISOString() : null,
        }
      : null,
    hasBillingHistory: Boolean(own) || billingHistory,
    meters: usage.meters,
    caps: usage.caps,
    checkoutOpen: getCheckoutOpen(),
  };
}

/**
 * The workspace's meters with real counts. Features this deployment can't
 * offer (file storage, custom domains, AI) are left out, and one failed
 * count doesn't hide the others. `cappedOnly` counts only what the plan
 * caps (the app shell's notice only wants meters that can fill up).
 */
export async function getUsageMeters(
  scope: ActiveScope,
  {
    cappedOnly = false,
    skip = [],
  }: { cappedOnly?: boolean; skip?: readonly MeterId[] } = {},
): Promise<{ plan: Plan; meters: MeterResult[]; caps: MeterCaps }> {
  const isTeam = !isOwnWorkspaceOf(scope.organizationId, scope.userId);
  const [plan, personalPlan] = await Promise.all([
    getPlanForScope(scope),
    getPlan(scope.userId),
  ]);
  const limits = getPlanLimits(plan);
  const caps = meterCapsFor(plan, { isTeam, personalPlan });

  const loaders: Array<{
    id: MeterId;
    label: string;
    load: () => Promise<Omit<Meter, "id" | "label">>;
  }> = [
    {
      id: "dynamicCodes",
      label: meterLabel("dynamicCodes"),
      load: async () => {
        const usage = await getCodeUsage(scope);
        return {
          used: usage.used,
          limit: usage.limit,
          unit: "count",
          note: "Archived codes don't count.",
        };
      },
    },
    {
      id: "landingPages",
      label: meterLabel("landingPages"),
      load: async () => {
        const usage = await getPageUsage(scope);
        return { used: usage.used, limit: usage.limit, unit: "count" };
      },
    },
    {
      id: "formResponses",
      label: meterLabel("formResponses"),
      load: async () => {
        const usage = await getFormResponseUsage(scope);
        return {
          used: usage.used,
          limit: usage.limit,
          unit: "count",
          resetsAt: usage.resetsAt.toISOString(),
        };
      },
    },
  ];

  if (isFeatureAvailable("fileStorage")) {
    loaders.push({
      id: "storage",
      label: meterLabel("storage"),
      load: async () => {
        const storage = await getStorageOverview(scope);
        return {
          used: storage.usedBytes,
          limit: storage.storageBytes,
          unit: "bytes",
          note: `Up to ${formatBytes(storage.maxFileBytes)} per file.`,
        };
      },
    });
  }

  // Your own workspace on a plan without teams has one seat, yours: not a
  // limit worth a meter. A team on such a plan (its owner downgraded) is.
  if (scope.organizationId && (limits.teams || isTeam)) {
    const organizationId = scope.organizationId;
    loaders.push({
      id: "teamSeats",
      label: meterLabel("teamSeats"),
      load: async () => {
        const [members, pending] = await Promise.all([
          listTeamMembers(organizationId),
          listPendingInvitations(organizationId),
        ]);
        return {
          used: members.length + pending.length,
          limit: finite(limits.teamMembers),
          unit: "count",
          note:
            pending.length > 0
              ? `${members.length} members, ${pending.length} pending.`
              : "Members plus pending invitations.",
        };
      },
    });
  }

  if (getCustomDomainMode() !== "disabled") {
    loaders.push({
      id: "customDomains",
      label: meterLabel("customDomains"),
      load: async () => {
        const overview = await getDomainsOverview(scope);
        return {
          used: overview.domains.length,
          limit: overview.limit,
          unit: "count",
        };
      },
    });
  }

  loaders.push({
    id: "savedThemes",
    label: meterLabel("savedThemes", { isTeam }),
    load: async () => {
      // Your themes follow your own plan; another workspace's its owners'.
      const themeLimits = isTeam ? limits : getPlanLimits(personalPlan);
      const used = await countThemesInScope(scope);
      return {
        used,
        limit:
          isTeam && !themeLimits.teamThemes
            ? 0
            : finite(themeLimits.savedThemes),
        unit: "count",
      };
    },
  });

  loaders.push({
    id: "oauthApps",
    label: meterLabel("oauthApps"),
    load: async () => {
      const apps = await listOAuthApps(scope);
      return {
        used: apps.length,
        limit: finite(limits.oauthApps),
        unit: "count",
      };
    },
  });

  if (isFeatureAvailable("aiArt")) {
    loaders.push({
      id: "aiArt",
      label: meterLabel("aiArt"),
      load: async () => {
        const credits = await getArtCredits(scope);
        return {
          used: credits.used,
          limit: credits.limit,
          unit: "count",
          resetsAt: credits.resetsAt,
          note: aiArtNote({ pooled: credits.pooled, isTeam }),
        };
      },
    });
  }

  if (isFeatureAvailable("aiThemes")) {
    loaders.push({
      id: "aiThemes",
      label: meterLabel("aiThemes"),
      load: async () => {
        // The person's own count and subscription, on every workspace.
        const usage = await validateSubscriptionAndUsage(scope.userId);
        return {
          used: usage.requestsUsed,
          limit: usage.isSubscribed ? null : AI_REQUEST_FREE_TIER_LIMIT,
          unit: "count",
          note: usage.isSubscribed
            ? isTeam
              ? "Counted for you, not the team."
              : undefined
            : "A one-time allowance on Free.",
        };
      },
    });
  }

  // A cap of 0 (not on this plan) is a plan badge's job, not a meter's.
  const counted = loaders.filter((meter) => {
    if (skip.includes(meter.id)) return false;
    if (!cappedOnly) return true;
    const limit = caps[meter.id]?.limit;
    return limit === undefined || (limit !== null && limit > 0);
  });
  const settled = await Promise.allSettled(
    counted.map((meter) => meter.load()),
  );
  const meters: MeterResult[] = settled.map((result, index) => {
    const { id, label } = counted[index] as (typeof counted)[number];
    if (result.status === "fulfilled") return { id, label, ...result.value };
    logError(result.reason as Error, { action: "plan-usage.meter", meter: id });
    return { id, label, failed: true };
  });

  return { plan, meters, caps };
}
