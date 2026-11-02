import { createHash } from "node:crypto";

// Everyone has one workspace of their own, created at sign-up (./server.ts),
// on their first dashboard visit (apps/docs/lib/workspaces.ts) or by the
// backfill (packages/database/scripts/backfill-workspaces.mjs). Its row ids
// are derived from the user id, so every one of those paths writes the same
// rows: `INSERT ... ON CONFLICT (id) DO NOTHING` makes creating it idempotent
// and safe under races, and "is this X's own workspace?" is a comparison, not
// a lookup. The backfill script computes the same ids (a test keeps them
// equal); never change the formula, or existing workspaces stop being found.

function digest(userId: string): string {
  return createHash("sha256")
    .update(`qrdx:own-workspace:${userId}`)
    .digest("hex")
    .slice(0, 32);
}

/** organization.id of the user's own workspace. */
export function ownWorkspaceId(userId: string): string {
  return `ws_${digest(userId)}`;
}

/** member.id of the user's owner membership in it. */
export function ownWorkspaceMemberId(userId: string): string {
  return `wsm_${digest(userId)}`;
}

export function isOwnWorkspaceOf(
  organizationId: string,
  userId: string
): boolean {
  return organizationId === ownWorkspaceId(userId);
}
