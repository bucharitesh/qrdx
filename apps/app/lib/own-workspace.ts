import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";

/**
 * The scope is the user's own workspace (what used to be their personal
 * workspace): copy says "you" instead of naming the workspace, and their own
 * subscription is the plan in force. Light on imports, so pure services and
 * their tests can use it.
 */
export function isOwnWorkspaceScope(scope: {
  userId: string;
  organizationId: string;
}): boolean {
  return isOwnWorkspaceOf(scope.organizationId, scope.userId);
}
