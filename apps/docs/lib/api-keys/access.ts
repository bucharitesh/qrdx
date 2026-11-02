// Who sees and revokes API keys, and the role a key acts with. Pure (unit
// tested) and client-safe: Settings → Developers uses the same rules to
// decide what to show.

import type { ActiveScope, ScopeRole } from "@/lib/scope";

/**
 * Team owners and admins see (and can revoke) every key in their team;
 * members see only their own. In a personal workspace every key is the
 * user's own.
 */
export function canSeeAllKeys(
  scope: Pick<ActiveScope, "organizationId" | "role">,
): boolean {
  return !scope.organizationId || scope.role !== "member";
}

export function canRevokeKey(
  scope: Pick<ActiveScope, "userId" | "organizationId" | "role">,
  key: { userId: string },
): boolean {
  return key.userId === scope.userId || canSeeAllKeys(scope);
}

/**
 * The role a team key acts with: its creator's membership role right now,
 * the strongest of several ("owner,admin"), the same rule as lib/scope.ts.
 * Read on every request, so a demotion takes effect at once.
 */
export function roleFromMembership(memberRole: string): ScopeRole {
  const roles = memberRole.split(",").map((role) => role.trim());
  if (roles.includes("owner")) return "owner";
  return roles.includes("admin") ? "admin" : "member";
}
