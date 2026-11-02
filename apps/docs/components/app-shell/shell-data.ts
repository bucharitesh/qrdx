import "server-only";

import { countUnarchived } from "@/app/dashboard/codes/_lib/qr-codes";
import {
  cheapestPlanWith,
  getPlan,
  getPlanForScope,
  getPlanLimits,
  type Plan,
} from "@/lib/plans";
import { getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

/** What the app chrome shows about the workspace (no secrets, no PII). */
export interface ShellData {
  /** Plan of the active workspace (a team's comes from its owners). */
  plan: Plan;
  /** The signed-in person's own plan (their subscription). */
  personalPlan: Plan;
  /** May change the workspace's plan: personal, or a team owner. */
  canUpgrade: boolean;
  /**
   * Dynamic codes against the plan's cap, and the cheapest plan without one
   * (null when no plan lifts it); null when the plan has no cap.
   */
  codes: { used: number; limit: number; unlimitedPlan: Plan | null } | null;
}

/**
 * Plan and code count for the top bar and the sidebar meter. Null when
 * signed out (proxy.ts redirects those visitors; pages check again) or when
 * the lookup fails: the chrome then leaves the meter out, and the page
 * itself reports the error.
 */
export async function getShellData(): Promise<ShellData | null> {
  try {
    const scope = await getActiveScope();
    const [plan, personalPlan] = await Promise.all([
      getPlanForScope(scope),
      getPlan(scope.userId),
    ]);
    const limit = getPlanLimits(plan).dynamicCodes;
    const codes = Number.isFinite(limit)
      ? {
          used: await countUnarchived(scope),
          limit,
          unlimitedPlan: cheapestPlanWith(
            (limits) => !Number.isFinite(limits.dynamicCodes),
          ),
        }
      : null;
    return {
      plan,
      personalPlan,
      canUpgrade: !scope.organizationId || scope.role === "owner",
      codes,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) return null;
    logError(error as Error, { action: "app-shell.getShellData" });
    return null;
  }
}
