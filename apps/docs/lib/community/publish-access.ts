import "server-only";

import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import {
  canEditTheme,
  isPersonalTheme,
} from "@/app/dashboard/themes/_lib/queries";
import { can } from "@/lib/permissions";
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
