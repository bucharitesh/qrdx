import "server-only";

import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import { database as db } from "@repo/database";
import { subscription as subscriptionTable } from "@repo/database/schema";
import { eq } from "drizzle-orm";

import { getFormResponseUsage } from "@/app/api/forms/_lib/responses";
import { getCodeUsage } from "@/app/dashboard/codes/_lib/qr-codes";
import { getDomainsOverview } from "@/app/dashboard/domains/_lib/domains";
import { getPageUsage } from "@/app/dashboard/pages/_lib/landing-pages";
import {
  getTeam,
  listPendingInvitations,
  listTeamMembers,
} from "@/app/dashboard/team/_lib/queries";
import { countThemesInScope } from "@/app/dashboard/themes/_lib/queries";
import { getArtCredits } from "@/lib/ai/art";
import { AI_REQUEST_FREE_TIER_LIMIT } from "@/lib/constants";
import {
  getCustomDomainMode,
  isFeatureAvailable,
} from "@/lib/feature-availability";
import { getStorageOverview } from "@/lib/files/service";
import { formatBytes } from "@/lib/files/types";
import { listOAuthApps } from "@/lib/oauth-apps/service";
import {
  getPlan,
  getPlanForScope,
  getPlanLimits,
  type Plan,
  planForSubscriptionProduct,
} from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import {
  getMyActiveSubscription,
  validateSubscriptionAndUsage,
} from "@/lib/subscription";
import type { Meter, MeterId, SubscriptionSummary } from "./meters";

/** A meter, or why it couldn't be read this time. */
export type MeterResult = Meter | { id: MeterId; label: string; failed: true };

export interface PlanUsage {
  plan: Plan;
  /** isTeam: not the viewer's own workspace (its plan is its owners') */
  workspace: { isTeam: boolean; name: string };
  /** An owner of the workspace (a workspace's plan is its owners'). */
  canChangePlan: boolean;
  /** The signed-in person's own subscription (null when they have none). */
  subscription: SubscriptionSummary | null;
  /**
   * They have paid before (any subscription, even canceled or past due), so
   * the billing portal has their invoices and payment method.
   */
  hasBillingHistory: boolean;
  meters: MeterResult[];
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
 * real count. Features this deployment can't offer (file storage, custom
 * domains, AI) are left out. One failed count doesn't hide the others.
 */
export async function getPlanUsage(scope: ActiveScope): Promise<PlanUsage> {
  const isTeam = !isOwnWorkspaceOf(scope.organizationId, scope.userId);
  const [plan, personalPlan, own, team, billingHistory] = await Promise.all([
    getPlanForScope(scope),
    getPlan(scope.userId),
    getMyActiveSubscription(scope.userId),
    getTeam(scope.organizationId),
    hasAnySubscription(scope.userId),
  ]);
  const limits = getPlanLimits(plan);

  const loaders: Array<{
    id: MeterId;
    label: string;
    load: () => Promise<Omit<Meter, "id" | "label">>;
  }> = [
    {
      id: "dynamicCodes",
      label: "Dynamic QR codes",
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
      label: "Landing pages",
      load: async () => {
        const usage = await getPageUsage(scope);
        return { used: usage.used, limit: usage.limit, unit: "count" };
      },
    },
    {
      id: "formResponses",
      label: "Form responses this month",
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
      label: "File storage",
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

  if (scope.organizationId) {
    const organizationId = scope.organizationId;
    loaders.push({
      id: "teamSeats",
      label: "Team seats",
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
      label: "Custom domains",
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
    label: isTeam ? "Shared themes" : "Saved themes",
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
    label: "OAuth apps",
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
      label: "AI art images this month",
      load: async () => {
        const credits = await getArtCredits(scope);
        return {
          used: credits.used,
          limit: credits.limit,
          unit: "count",
          resetsAt: credits.resetsAt,
          note: credits.pooled ? "Shared by the whole team." : undefined,
        };
      },
    });
  }

  if (isFeatureAvailable("aiThemes")) {
    loaders.push({
      id: "aiThemes",
      label: "AI theme requests",
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

  const settled = await Promise.allSettled(
    loaders.map((meter) => meter.load()),
  );
  const meters: MeterResult[] = settled.map((result, index) => {
    const { id, label } = loaders[index] as (typeof loaders)[number];
    if (result.status === "fulfilled") return { id, label, ...result.value };
    logError(result.reason as Error, { action: "plan-usage.meter", meter: id });
    return { id, label, failed: true };
  });

  return {
    plan,
    workspace: {
      isTeam,
      name: team?.name ?? "This workspace",
    },
    canChangePlan: scope.role === "owner",
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
    meters,
  };
}
