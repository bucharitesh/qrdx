import "server-only";

import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { can, forbiddenMessage } from "@/lib/permissions";
import {
  getOwnerPlanForOrganization,
  getPlanLimits,
  type Plan,
} from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";

// Who gets the workspace audit log. A workspace has it under the same rule
// as single sign-on: an owner or billing member is on a plan with `auditLog`
// (Business; lib/plans.ts getOwnerPlanForOrganization). On a self-hosted
// server it also needs the QRdx licence key (packages/availability/rules.ts
// `auditLog`). Reading and exporting it is for owners and admins
// (lib/permissions.ts `auditLog.view`).

/** The plan includes the audit log. */
export const planHasAuditLog = (plan: Plan) => getPlanLimits(plan).auditLog;

/**
 * Whether the workspace's changes are recorded now: the server has the
 * licence and the workspace's plan includes the audit log. `plan` skips the
 * lookup when the caller already knows it.
 */
export async function isAuditLogEntitled(
  organizationId: string,
  plan?: Plan,
): Promise<boolean> {
  if (!isFeatureAvailable("auditLog")) return false;
  return planHasAuditLog(
    plan ?? (await getOwnerPlanForOrganization(organizationId)),
  );
}

export interface AuditLogAccess {
  plan: Plan;
  /** The plan includes the audit log */
  entitled: boolean;
  /** The viewer is an owner or admin */
  canView: boolean;
}

export async function getAuditLogAccess(
  scope: Pick<ActiveScope, "organizationId" | "role">,
): Promise<AuditLogAccess> {
  const plan = await getOwnerPlanForOrganization(scope.organizationId);
  return {
    plan,
    entitled: planHasAuditLog(plan),
    canView: can(scope.role, "auditLog.view"),
  };
}

/**
 * For the export route and the list action: 404 where the feature doesn't
 * exist, 403 FORBIDDEN for members, viewers and billing members, 403
 * PLAN_REQUIRED for a workspace without the plan.
 */
export async function requireAuditLogAccess(
  scope: Pick<ActiveScope, "organizationId" | "role">,
): Promise<AuditLogAccess> {
  if (!isFeatureAvailable("auditLog")) {
    throw new HttpError(
      404,
      "NOT_FOUND",
      "The audit log isn't available on this server.",
    );
  }
  if (!can(scope.role, "auditLog.view")) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      forbiddenMessage(scope.role, "auditLog.view"),
    );
  }
  const access = await getAuditLogAccess(scope);
  if (!access.entitled) {
    throw new HttpError(
      403,
      "PLAN_REQUIRED",
      "The audit log comes with the Business plan.",
    );
  }
  return access;
}
