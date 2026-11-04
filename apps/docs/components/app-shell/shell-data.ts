import "server-only";

import { unstable_rethrow } from "next/navigation";
import { countUnarchived } from "@/app/dashboard/codes/_lib/qr-codes";
import { attentionMeters, type Meter } from "@/app/settings/usage/_lib/meters";
import {
  getUsageMeters,
  meterCapsFor,
} from "@/app/settings/usage/_lib/plan-usage";
import type { ShellLimits } from "@/components/limits/plan-limits-provider";
import { getChangelogSeen } from "@/lib/changelog-feed-server";
import { getCheckoutOpen } from "@/lib/checkout-availability";
import { can } from "@/lib/permissions";
import {
  cheapestPlanWith,
  getPlan,
  getPlanForScope,
  getPlanLimits,
  type Plan,
} from "@/lib/plans";
import { getActiveWorkspace } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { workspaceHref } from "@/lib/workspace-paths";
import { loadWorkspaces, type Workspace } from "@/lib/workspaces";
import { UnauthorizedError } from "@/types/errors";
import type { WhatsNewSeen } from "./whats-new";

export type ShellWorkspace = Pick<
  Workspace,
  "id" | "name" | "slug" | "logo" | "role" | "own"
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
  /** May change the workspace's plan: its owners and billing members. */
  canUpgrade: boolean;
  /** May create another workspace (the person's plan allows it). */
  canCreateWorkspace: boolean;
  /**
   * Dynamic codes against the plan's cap, and the cheapest plan without one
   * (null when no plan lifts it); null when the plan has no cap.
   */
  codes: { used: number; limit: number; unlimitedPlan: Plan | null } | null;
  /** The plan's caps, upgrade rules and checkout, for limit cards */
  limits: ShellLimits;
  /** What "What's new" the person has seen (null when it couldn't be read) */
  changelogSeen: WhatsNewSeen | null;
}

const toShellWorkspace = ({
  id,
  name,
  slug,
  logo,
  role,
  own,
}: Workspace): ShellWorkspace => ({ id, name, slug, logo, role, own });

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
    const [plan, personalPlan, workspaces, seen] = await Promise.all([
      getPlanForScope(scope),
      getPlan(scope.userId),
      loadWorkspaces(user),
      // Without it nothing is marked new; the rest of the chrome still works.
      getChangelogSeen(scope.userId).catch((error: unknown) => {
        logError(error as Error, { action: "app-shell.changelogSeen" });
        return null;
      }),
    ]);
    const isTeam = !workspace.own;
    const canUpgrade = can(scope.role, "billing.manage");
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
      canUpgrade,
      canCreateWorkspace: getPlanLimits(personalPlan).teams,
      codes,
      limits: {
        plan,
        canUpgrade,
        checkoutOpen: getCheckoutOpen(),
        caps: meterCapsFor(plan, { isTeam, personalPlan }),
        isTeam,
        usageHref: workspaceHref(workspace.slug, "/settings/usage"),
      },
      changelogSeen: seen && {
        viewerId: scope.userId,
        stored: seen.stored,
        signedUpAt: seen.signedUpAt,
      },
    };
  } catch (error) {
    // Next's own signals (a request-time API during prerendering, a
    // redirect) aren't failures: let them through.
    unstable_rethrow(error);
    if (error instanceof UnauthorizedError) return null;
    logError(error as Error, { action: "app-shell.getShellData" });
    return null;
  }
}

/**
 * The open workspace's limits at 90% or more, fullest first, for the
 * sidebar's notice. Only capped meters are counted; unlimited ones never
 * warn. Empty when signed out or when the counts fail (the page that
 * enforces a limit still says so).
 */
export async function getShellLimitWarnings(): Promise<Meter[]> {
  try {
    const { scope } = await getActiveWorkspace();
    // AI theme requests are the person's one-time allowance on Free, used in
    // the playground (which says so when it runs out); once used up it
    // would sit here for good, so it stays on Plan & usage only.
    const usage = await getUsageMeters(scope, {
      cappedOnly: true,
      skip: ["aiThemes"],
    });
    return attentionMeters(usage.meters);
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      logError(error as Error, { action: "app-shell.limitWarnings" });
    }
    return [];
  }
}
