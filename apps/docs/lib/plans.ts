import "server-only";

import { database as db, member } from "@repo/database";
import { and, eq, like } from "drizzle-orm";
import { cache } from "react";
import { getMyActiveSubscription } from "./subscription";

/**
 * Plans and their limits — the single source of truth for feature gating.
 * "Codes never die": limits only block creating new things; existing dynamic
 * codes keep redirecting and stay editable after a downgrade.
 */
export type Plan = "free" | "pro";

/** Use `Number.isFinite(limit)` to tell a cap from "unlimited". */
export const UNLIMITED = Number.POSITIVE_INFINITY;

export interface PlanLimits {
  /** Active (non-archived) dynamic QR codes per scope */
  dynamicCodes: number;
  /** How far back scan analytics can be queried */
  analyticsRetentionDays: number;
  brandKits: number;
  customDomains: number;
  /** May create teams (organizations) */
  teams: boolean;
  /** May create dynamic codes in bulk via the REST API */
  bulkApi: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    dynamicCodes: 5,
    analyticsRetentionDays: 30,
    brandKits: 1,
    customDomains: 0,
    teams: false,
    bulkApi: false,
  },
  pro: {
    dynamicCodes: UNLIMITED,
    analyticsRetentionDays: 365,
    brandKits: UNLIMITED,
    customDomains: 5,
    teams: true,
    bulkApi: true,
  },
};

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

/** A user's own plan: Pro while they hold an entitled Polar subscription. */
export const getPlan = cache(async (userId: string): Promise<Plan> => {
  const subscription = await getMyActiveSubscription(userId);
  return subscription ? "pro" : "free";
});

const hasOwnerRole = (role: string) =>
  role
    .split(",")
    .map((r) => r.trim())
    .includes("owner");

/**
 * Plan for resources owned by an organization: Pro when any of its owners is
 * on Pro. An organization without owners falls back to Free.
 */
export const getOwnerPlanForOrganization = cache(
  async (organizationId: string): Promise<Plan> => {
    const owners = await db
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          like(member.role, "%owner%"),
        ),
      );

    const plans = await Promise.all(
      owners.filter((m) => hasOwnerRole(m.role)).map((m) => getPlan(m.userId)),
    );
    return plans.includes("pro") ? "pro" : "free";
  },
);

/** Plan that governs a personal or team scope (see lib/scope). */
export function getPlanForScope(scope: {
  userId: string;
  organizationId: string | null;
}): Promise<Plan> {
  return scope.organizationId
    ? getOwnerPlanForOrganization(scope.organizationId)
    : getPlan(scope.userId);
}
