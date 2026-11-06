import "server-only";
import { database } from "@repo/database";

// Keep in sync with apps/docs/lib/subscription.ts: Polar keeps a subscription
// "active" until a cancellation takes effect at period end.
export const ENTITLED_SUBSCRIPTION_STATUSES = ["active", "trialing"];

/**
 * True when the user holds any entitled subscription. Gates team creation:
 * every paid product maps to Pro or Business (unknown products count as Pro,
 * see apps/docs/lib/plans.ts `planForSubscriptionProduct`) and both include
 * teams. apps/docs/lib/plans.ts is the source of truth for everything else.
 */
export async function hasEntitledSubscription(userId: string) {
  const row = await database.query.subscription.findFirst({
    columns: { id: true },
    where: (table, { and, eq, inArray }) =>
      and(
        eq(table.userId, userId),
        inArray(table.status, ENTITLED_SUBSCRIPTION_STATUSES)
      ),
  });
  return Boolean(row);
}

export type WorkspacePlanTier = "free" | "pro" | "business";

// Business products are the env ids; any other entitled product counts as Pro
// (apps/docs/lib/plans.ts planForSubscriptionProduct).
const BUSINESS_PRODUCT_IDS = new Set(
  [
    process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID,
    process.env.NEXT_PUBLIC_QRDX_BUSINESS_YEARLY_PRODUCT_ID,
  ].filter(Boolean)
);

// The roles that pay for a workspace (PLAN_ROLES in apps/docs/lib/permissions.ts).
const PLAN_ROLES = new Set(["owner", "billing"]);

/**
 * A workspace's plan: the best entitled subscription among its owners and
 * billing members, like getOwnerPlanForOrganization in apps/docs/lib/plans.ts.
 * Seats (./server.ts) and workspace SSO (./ee/sso.ts) are decided by it.
 */
export async function workspacePlanTier(
  organizationId: string
): Promise<WorkspacePlanTier> {
  const payers = await database.query.member.findMany({
    columns: { userId: true, role: true },
    where: (table, { and, eq, like, or }) =>
      and(
        eq(table.organizationId, organizationId),
        or(like(table.role, "%owner%"), like(table.role, "%billing%"))
      ),
  });
  const payerIds = payers
    .filter((m) =>
      m.role.split(",").some((role) => PLAN_ROLES.has(role.trim()))
    )
    .map((m) => m.userId);
  if (payerIds.length === 0) return "free";

  const subscriptions = await database.query.subscription.findMany({
    columns: { productId: true },
    where: (table, { and, inArray }) =>
      and(
        inArray(table.userId, payerIds),
        inArray(table.status, ENTITLED_SUBSCRIPTION_STATUSES)
      ),
  });
  if (subscriptions.length === 0) return "free";
  return subscriptions.some((s) => BUSINESS_PRODUCT_IDS.has(s.productId))
    ? "business"
    : "pro";
}
