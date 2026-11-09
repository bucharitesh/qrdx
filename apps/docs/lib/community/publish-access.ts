import "server-only";

import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import { lacksRequiredTwoFactor } from "@repo/auth/workspace-two-factor";
import {
  communityItem,
  database as db,
  landingPage,
  member,
  qrPreset,
} from "@repo/database";
import { and, eq } from "drizzle-orm";
import {
  canEditTheme,
  isPersonalTheme,
} from "@/app/dashboard/themes/_lib/queries";
import { can, strongestRole } from "@/lib/permissions";
import {
  type ActiveScope,
  getActiveScope,
  WorkspaceNotFoundError,
} from "@/lib/scope";

// Who may publish something from a workspace to the community. The item is
// a snapshot credited to the person's own profile; in a shared workspace
// only its owners and admins may publish what's in it (lib/permissions.ts),
// in your own workspace you always may.

/** "own", "workspace" (an owner or admin there), "view" or "none". */
export type PublishAccess = "own" | "workspace" | "view" | "none";

/**
 * What `userId` may do with a saved theme when publishing it (or its
 * frame): "own" (their themes), "workspace" (a theme of the open workspace
 * they manage), "view" (one they only see there) or "none" (another
 * workspace's, or one they aren't in).
 */
export async function themePublishAccess(
  userId: string,
  theme: { userId: string; organizationId: string | null },
): Promise<PublishAccess> {
  if (isPersonalTheme(theme, userId)) return "own";
  let scope: ActiveScope;
  try {
    scope = await getActiveScope();
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return "none";
    throw error;
  }
  if (
    scope.userId !== userId ||
    theme.organizationId !== scope.organizationId
  ) {
    return "none";
  }
  return canEditTheme(scope, theme) ? "workspace" : "view";
}

/**
 * Pages (and anything else in a workspace that isn't a theme): your own
 * workspace's always; a shared workspace's as its owner or admin.
 */
export function canPublishFromWorkspace(
  scope: Pick<ActiveScope, "userId" | "organizationId" | "role">,
): boolean {
  if (isOwnWorkspaceOf(scope.organizationId, scope.userId)) return true;
  return can(scope.role, "content.manageAll");
}

/** The refusal shown to members and viewers of a shared workspace. */
export const WORKSPACE_PUBLISH_REFUSAL =
  "Only owners and admins of this workspace can publish what's in it.";

/**
 * Whether `userId` may unpublish an item someone else published from a
 * shared workspace: as an owner or admin of the workspace the page or theme
 * is in (items stay on the publisher's profile; brand profiles come later),
 * and only while the workspace doesn't shut them out for lacking two-step
 * verification (lib/workspaces.ts shutsOut).
 */
export async function workspaceCanUnpublish(
  userId: string,
  itemId: string,
): Promise<boolean> {
  const [item] = await db
    .select({
      sourceKind: communityItem.sourceKind,
      sourceId: communityItem.sourceId,
    })
    .from(communityItem)
    .where(eq(communityItem.id, itemId))
    .limit(1);
  if (!item?.sourceId) return false;
  const table =
    item.sourceKind === "landing_page"
      ? landingPage
      : item.sourceKind === "qr_preset"
        ? qrPreset
        : null;
  if (!table) return false;
  const [source] = await db
    .select({ organizationId: table.organizationId })
    .from(table)
    .where(eq(table.id, item.sourceId))
    .limit(1);
  const organizationId = source?.organizationId;
  if (!organizationId || isOwnWorkspaceOf(organizationId, userId)) {
    return false;
  }
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    )
    .limit(1);
  if (!(row && can(strongestRole(row.role), "content.manageAll"))) {
    return false;
  }
  return !(await lacksRequiredTwoFactor(userId, organizationId));
}
