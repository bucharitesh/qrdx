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
