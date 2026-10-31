// Who owns and who may change an OAuth app. Pure (unit tested) and
// client-safe: the settings pages use the same rules to hide controls.

import type { ActiveScope } from "@/lib/scope";

export interface OAuthAppOwnership {
  ownerUserId: string | null;
  organizationId: string | null;
}

/** Registered by the QRdx team (scripts/create-oauth-app.ts): no owner. */
export function isFirstPartyApp(app: OAuthAppOwnership): boolean {
  return app.ownerUserId === null && app.organizationId === null;
}

/**
 * The app belongs to the active workspace: a team's apps in that team, the
 * user's own apps (made outside any team) in their personal workspace.
 * First-party apps belong to no workspace.
 */
export function isAppInScope(
  scope: Pick<ActiveScope, "userId" | "organizationId">,
  app: OAuthAppOwnership,
): boolean {
  if (isFirstPartyApp(app)) return false;
  return scope.organizationId
    ? app.organizationId === scope.organizationId
    : app.organizationId === null && app.ownerUserId === scope.userId;
}

/**
 * Only owners create, edit, delete apps or regenerate their secrets: team
 * owners in a team (admins and members can look), and the user in their
 * personal workspace (where their role is always "owner").
 */
export function canManageOAuthApps(scope: Pick<ActiveScope, "role">): boolean {
  return scope.role === "owner";
}

export function canEditOAuthApp(
  scope: Pick<ActiveScope, "userId" | "organizationId" | "role">,
  app: OAuthAppOwnership,
): boolean {
  return isAppInScope(scope, app) && canManageOAuthApps(scope);
}

/**
 * Apps whose consent screen shows no "unverified" note: reviewed by the QRdx
 * team, or registered by it.
 */
export function isTrustedApp(
  app: OAuthAppOwnership & { verified: boolean },
): boolean {
  return app.verified || isFirstPartyApp(app);
}
