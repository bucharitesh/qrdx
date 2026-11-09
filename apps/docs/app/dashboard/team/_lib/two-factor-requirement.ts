import "server-only";

import { twoFactorOnFor } from "@repo/auth/workspace-two-factor";
import { twoFactorRequiredIn } from "@repo/auth/workspace-two-factor-rules";
import { database as db, organization } from "@repo/database";
import { eq } from "drizzle-orm";
import { cheapestPlanWith, getPlanLimits, type Plan } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";

// The Team page's "Require two-step verification" (./two-factor-requirement-actions.ts
// changes it; packages/auth/workspace-two-factor.ts enforces it).

/** Why someone without two-step verification can't turn the requirement on. */
export const OWN_TWO_FACTOR_FIRST =
  "Turn on two-step verification for your own account first, in Settings under Profile & security.";

/** The workspace's metadata as stored (a JSON string), or null. */
export async function workspaceMetadataOf(
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ metadata: organization.metadata })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.metadata ?? null;
}

/** The plan that includes it, for copy ("comes with Business"). */
export function requirementPlanName(): string {
  const plan = cheapestPlanWith((limits) => limits.requireTwoFactor);
  return plan ? PLAN_NAMES[plan] : PLAN_NAMES.business;
}

export interface TwoFactorRequirementView {
  /** It applies: the setting is on and the plan includes it */
  required: boolean;
  /** The setting as stored (it stays while the plan doesn't include it) */
  stored: boolean;
  /** The workspace's plan includes it */
  planAllows: boolean;
  /** "Business" */
  planName: string;
  /** The person viewing has two-step verification on */
  viewerHasTwoFactor: boolean;
}

export async function loadTwoFactorRequirement(
  organizationId: string,
  plan: Plan,
  viewerId: string,
): Promise<TwoFactorRequirementView> {
  const [metadata, viewerHasTwoFactor] = await Promise.all([
    workspaceMetadataOf(organizationId),
    twoFactorOnFor(viewerId),
  ]);
  const stored = twoFactorRequiredIn(metadata);
  const planAllows = getPlanLimits(plan).requireTwoFactor;
  return {
    required: stored && planAllows,
    stored,
    planAllows,
    planName: requirementPlanName(),
    viewerHasTwoFactor,
  };
}
