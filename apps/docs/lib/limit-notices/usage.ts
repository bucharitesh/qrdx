import "server-only";

import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import { getFormResponseUsage } from "@/app/api/forms/_lib/responses";
import { getCodeUsage } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getPageUsage } from "@/app/(app)/dashboard/pages/_lib/landing-pages";
import { countThemesInScope } from "@/app/(app)/dashboard/themes/_lib/queries";
import { getArtCredits } from "@/lib/ai/art";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { getStorageOverview } from "@/lib/files/service";
import {
  getPlan,
  getPlanForScope,
  getPlanLimits,
  type Plan,
} from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import type { KnownUsage, LimitScope } from "./index";
import type { NoticeLimitId } from "./levels";

// One limit's usage, counted exactly as Plan & usage counts it
// (app/(app)/settings/usage/_lib/plan-usage.ts), for the notice emails.

export interface LimitUsage {
  plan: Plan;
  used: number;
  /** null = unlimited, 0 = not on the plan */
  limit: number | null;
  /** When a monthly allowance starts over (ISO string) */
  resetsAt?: string;
  /** AI art shared by the workspace */
  pooled?: boolean;
}

const finite = (value: number) => (Number.isFinite(value) ? value : null);

/**
 * The readers take a full scope; counting never looks at the role, so the
 * workspace's own is assumed.
 */
const asScope = (scope: LimitScope): ActiveScope => ({
  ...scope,
  role: "owner",
});

/** Null when the feature is off here (file storage, AI art). */
export async function readLimitUsage(
  limitScope: LimitScope,
  id: NoticeLimitId,
  known?: KnownUsage,
): Promise<LimitUsage | null> {
  const scope = asScope(limitScope);
  const plan = await getPlanForScope(scope);
  if (known) {
    return {
      plan,
      used: known.used,
      limit: known.limit,
      ...(known.pooled !== undefined ? { pooled: known.pooled } : {}),
      ...(id === "aiArt" || id === "formResponses"
        ? { resetsAt: nextMonth() }
        : {}),
    };
  }
  switch (id) {
    case "dynamicCodes": {
      const usage = await getCodeUsage(scope);
      return { plan, used: usage.used, limit: usage.limit };
    }
    case "landingPages": {
      const usage = await getPageUsage(scope);
      return { plan, used: usage.used, limit: usage.limit };
    }
    case "formResponses": {
      const usage = await getFormResponseUsage(scope);
      return {
        plan,
        used: usage.used,
        limit: usage.limit,
        resetsAt: usage.resetsAt.toISOString(),
      };
    }
    case "storage": {
      if (!isFeatureAvailable("fileStorage")) return null;
      const storage = await getStorageOverview(scope);
      return { plan, used: storage.usedBytes, limit: storage.storageBytes };
    }
    case "savedThemes": {
      // Your own workspace's themes follow your plan; a team's its owners'.
      const isTeam = !isOwnWorkspaceOf(scope.organizationId, scope.userId);
      const limits = getPlanLimits(isTeam ? plan : await getPlan(scope.userId));
      const used = await countThemesInScope(scope);
      return {
        plan,
        used,
        limit: isTeam && !limits.teamThemes ? 0 : finite(limits.savedThemes),
      };
    }
    case "aiArt": {
      if (!isFeatureAvailable("aiArt")) return null;
      const credits = await getArtCredits(scope);
      return {
        plan: credits.plan,
        used: credits.used,
        limit: credits.limit,
        resetsAt: credits.resetsAt,
        pooled: credits.pooled,
      };
    }
  }
}

/** First day of next month (UTC), when monthly allowances reset. */
function nextMonth(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();
}
