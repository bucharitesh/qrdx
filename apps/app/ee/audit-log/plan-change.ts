import "server-only";

import { database as db, member } from "@repo/database";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { recordAuditEvent } from "@/ee/audit-log/record";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { logError } from "@/lib/log-error";
import { holdsPlanRole } from "@/lib/permissions";
import {
  highestPlan,
  type Plan,
  planForSubscriptionProduct,
} from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import { getMyActiveSubscription } from "@/lib/subscription";

// "The workspace's plan changed", recorded by the billing webhook
// (app/api/webhook/polar) as a system event. A person's subscription sets
// the plan of every workspace where they're an owner or billing member
// (lib/plans.ts getOwnerPlanForOrganization), so the webhook takes a
// snapshot of those workspaces' plans before it saves the subscription and
// records the ones that changed after. Plans are read without React's
// per-request cache here: both snapshots happen in one request.

export type WorkspacePlans = Map<string, Plan>;

async function planOf(userId: string): Promise<Plan> {
  const active = await getMyActiveSubscription(userId);
  return active ? planForSubscriptionProduct(active.productId) : "free";
}

/** The plan of every workspace `userId` pays for, read fresh. */
async function workspacePlans(userId: string): Promise<WorkspacePlans> {
  const memberships = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId));
  const paid = memberships
    .filter((row) => holdsPlanRole(row.role))
    .map((row) => row.organizationId);
  const plans: WorkspacePlans = new Map();
  if (paid.length === 0) return plans;
  const payers = await db
    .select({
      organizationId: member.organizationId,
      userId: member.userId,
      role: member.role,
    })
    .from(member)
    .where(
      and(
        inArray(member.organizationId, paid),
        or(like(member.role, "%owner%"), like(member.role, "%billing%")),
      ),
    );
  const personal = new Map<string, Plan>();
  for (const payer of payers) {
    if (!holdsPlanRole(payer.role) || personal.has(payer.userId)) continue;
    personal.set(payer.userId, await planOf(payer.userId));
  }
  for (const organizationId of paid) {
    plans.set(
      organizationId,
      highestPlan(
        payers
          .filter(
            (payer) =>
              payer.organizationId === organizationId &&
              holdsPlanRole(payer.role),
          )
          .map((payer) => personal.get(payer.userId) ?? "free"),
      ),
    );
  }
  return plans;
}

/**
 * Before the webhook saves a subscription: the plans of the workspaces its
 * owner pays for. Null when there's nothing to compare (no user, no
 * licence) or the lookup failed; billing never waits on the audit log.
 */
export async function plansBeforeBillingChange(
  userId: string | null | undefined,
): Promise<WorkspacePlans | null> {
  if (!(userId && isFeatureAvailable("auditLog"))) return null;
  try {
    return await workspacePlans(userId);
  } catch (error) {
    logError(error as Error, { action: "audit-log.plan-snapshot" });
    return null;
  }
}

/** After it saved the subscription: records each workspace whose plan changed. */
export async function recordPlanChanges(
  userId: string | null | undefined,
  before: WorkspacePlans | null,
): Promise<void> {
  if (!(userId && before)) return;
  try {
    const after = await workspacePlans(userId);
    for (const [organizationId, plan] of after) {
      const previous = before.get(organizationId);
      if (!previous || previous === plan) continue;
      recordAuditEvent(
        { organizationId, userId: null },
        {
          action: "workspace.plan_changed",
          target: { type: "workspace", id: organizationId },
          metadata: {
            before: { plan: PLAN_NAMES[previous] },
            after: { plan: PLAN_NAMES[plan] },
          },
        },
        { system: { label: "Billing" }, plan },
      );
    }
  } catch (error) {
    logError(error as Error, { action: "audit-log.plan-change" });
  }
}
