import "server-only";

import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { isFirstPartyApp } from "./access";

/**
 * Who the consent screen says built the app: QRdx for first-party apps; for
 * an app in its creator's own workspace, the creator's name (as before
 * workspaces, when it was their personal app); else the workspace's name.
 */
export function appBuilderName(app: {
  ownerUserId: string | null;
  organizationId: string | null;
  teamName: string | null;
  ownerName: string | null;
}): string {
  if (isFirstPartyApp(app)) return "QRdx";
  const ownApp =
    app.ownerUserId !== null &&
    app.organizationId !== null &&
    app.organizationId === ownWorkspaceId(app.ownerUserId);
  return (
    (ownApp ? app.ownerName : app.teamName) ??
    app.ownerName ??
    "an independent developer"
  );
}
