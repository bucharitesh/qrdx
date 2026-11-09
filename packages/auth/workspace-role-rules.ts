// Workspace roles as stored in member.role and invitation.role: pure and
// client-safe. ./workspace-roles.ts refuses any other role when one is
// written; apps/docs/lib/permissions.ts decides what each role may do.
//
// Better Auth's organization plugin stores a role field as given, and reads
// it by splitting on commas without trimming. Its invitation check does
// trim, though, so before this an admin could invite " owner": the plugin
// saw no owner role in it, and anything here that trimmed read an owner.
// So a role is written only as exactly one of the five names, and every
// reader here matches parts exactly, like the plugin: " owner", "owner "
// and "Owner" hold no role at all.

export const WORKSPACE_ROLE_NAMES = [
  "owner",
  "admin",
  "member",
  "billing",
  "viewer",
] as const;

export type WorkspaceRoleName = (typeof WORKSPACE_ROLE_NAMES)[number];

/** Exactly one of the five names: no spaces, no other case, no list. */
export function isWorkspaceRoleName(
  value: unknown
): value is WorkspaceRoleName {
  return (
    typeof value === "string" &&
    (WORKSPACE_ROLE_NAMES as readonly string[]).includes(value)
  );
}

/**
 * The roles a stored field holds, read the way Better Auth reads it: split on
 * commas, nothing trimmed or case-folded, anything else dropped. QRdx writes
 * one role; a list can only come from before roles were checked.
 */
export function rolesInField(
  field: string | null | undefined
): WorkspaceRoleName[] {
  return (field ?? "").split(",").filter(isWorkspaceRoleName);
}

/** True when the stored field holds `role` exactly. */
export function fieldHoldsRole(
  field: string | null | undefined,
  role: WorkspaceRoleName
): boolean {
  return rolesInField(field).includes(role);
}

/** The error code a refused role carries. */
export const INVALID_ROLE = "INVALID_ROLE";
