import "server-only";

import { countUnarchived } from "@/app/dashboard/codes/_lib/qr-codes";
import {
  cheapestPlanWith,
  getPlan,
  getPlanForScope,
  getPlanLimits,
  type Plan,
} from "@/lib/plans";
import { getActiveWorkspace } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { loadWorkspaces, type Workspace } from "@/lib/workspaces";
import { UnauthorizedError } from "@/types/errors";

export type ShellWorkspace = Pick<
  Workspace,
  "id" | "name" | "slug" | "role" | "own"
>;

/** What the app chrome shows about the workspace (no secrets, no PII). */
export interface ShellData {
  /** The open workspace */
  workspace: ShellWorkspace;
  /** Every workspace the person is in, for the switcher (their own first) */
  workspaces: ShellWorkspace[];
  /** Plan of the open workspace (from its owners' subscriptions). */
  plan: Plan;
  /** The signed-in person's own plan (their subscription). */
  personalPlan: Plan;
  /** May change the workspace's plan: its owners. */
  canUpgrade: boolean;
  /** May create another workspace (the person's plan allows it). */
  canCreateWorkspace: boolean;
  /**
   * Dynamic codes against the plan's cap, and the cheapest plan without one
   * (null when no plan lifts it); null when the plan has no cap.
   */
  codes: { used: number; limit: number; unlimitedPlan: Plan | null } | null;
}

const toShellWorkspace = ({
  id,
  name,
  slug,
  role,
  own,
}: Workspace): ShellWorkspace => ({ id, name, slug, role, own });

/**
 * The open workspace (from the URL, else the person's default), their other
 * workspaces, plan and code count, for the top bar, sidebar and switcher.
 * Null when signed out (proxy.ts redirects those visitors; pages check
 * again) or when the lookup fails: the chrome then leaves those parts out,
 * and the page itself reports the error. A workspace the person can't open
 * is the [workspace] layout's 404, before this runs.
 */
export async function getShellData(): Promise<ShellData | null> {
  try {
    const { scope, workspace, user } = await getActiveWorkspace();
    const [plan, personalPlan, workspaces] = await Promise.all([
      getPlanForScope(scope),
      getPlan(scope.userId),
      loadWorkspaces(user),
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
      workspace: toShellWorkspace(workspace),
      workspaces: workspaces.map(toShellWorkspace),
      plan,
      personalPlan,
      canUpgrade: scope.role === "owner",
      canCreateWorkspace: getPlanLimits(personalPlan).teams,
      codes,
    };
  } catch (error) {
    if (error instanceof UnauthorizedError) return null;
    logError(error as Error, { action: "app-shell.getShellData" });
    return null;
  }
}
