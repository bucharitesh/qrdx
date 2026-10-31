import "server-only";

import { auth } from "@repo/auth/server";
import { database as db, member } from "@repo/database";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { UnauthorizedError } from "@/types/errors";

export type ScopeRole = "owner" | "admin" | "member";

export interface ActiveScope {
  userId: string;
  /** null = the user's personal workspace */
  organizationId: string | null;
  /** Role in the active organization ("owner" in the personal workspace) */
  role: ScopeRole;
}

function strongestRole(role: string): ScopeRole {
  const roles = role.split(",").map((r) => r.trim());
  if (roles.includes("owner")) return "owner";
  return roles.includes("admin") ? "admin" : "member";
}

/**
 * The signed-in user's working scope: the session's active organization while
 * they are still a member of it, otherwise their personal workspace.
 * Throws UnauthorizedError when signed out.
 */
export async function getActiveScope(
  requestHeaders?: Headers,
): Promise<ActiveScope> {
  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  const userId: string = session.user.id;
  const organizationId: string | null =
    session.session?.activeOrganizationId ?? null;
  if (!organizationId) {
    return { userId, organizationId: null, role: "owner" };
  }

  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);

  if (!membership) {
    return { userId, organizationId: null, role: "owner" };
  }
  return { userId, organizationId, role: strongestRole(membership.role) };
}

/** True when a row (qr_code, brand_kit, custom_domain) belongs to the scope. */
export function isInScope(
  scope: ActiveScope,
  row: { userId: string; organizationId: string | null },
): boolean {
  return scope.organizationId
    ? row.organizationId === scope.organizationId
    : row.organizationId === null && row.userId === scope.userId;
}
