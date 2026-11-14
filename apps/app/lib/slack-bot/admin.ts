import "server-only";

import { recordAuditEvent } from "@/ee/audit-log/record";
import { HttpError } from "@/lib/error-response";
import { can } from "@/lib/permissions";
import type { ActiveScope } from "@/lib/scope";
import { isSlackBotEnabled } from "./config";
import {
  deleteWorkspaceLink,
  listWorkspaceLinks,
  SlackBotStoreUnavailableError,
  type WorkspaceSlackLink,
} from "./store";

// The Slack people linked to a QRdx workspace, for its owners and admins
// (Settings → API keys & apps). A link makes codes in the workspace as one
// of its members, like that member's API key, so the people who see and
// revoke everyone's keys see and revoke these too (apiKeys.manageAll).
// Nothing here touches the bot's tables unless the bot is set up here.

export type WorkspaceSlackLinksState =
  | { available: true; links: WorkspaceSlackLink[] }
  | { available: false };

export const canManageSlackLinks = (scope: Pick<ActiveScope, "role">) =>
  can(scope.role, "apiKeys.manageAll");

/**
 * The workspace's Slack links for an owner or admin; null when the bot
 * isn't set up on this server or the viewer may not manage them (nothing
 * to show, and no query made).
 */
export async function loadWorkspaceSlackLinks(
  scope: ActiveScope,
): Promise<WorkspaceSlackLinksState | null> {
  if (!(isSlackBotEnabled() && canManageSlackLinks(scope))) return null;
  try {
    return {
      available: true,
      links: await listWorkspaceLinks(scope.organizationId),
    };
  } catch (error) {
    if (error instanceof SlackBotStoreUnavailableError) {
      return { available: false };
    }
    throw error;
  }
}

/** "U0ANA in Acme": who a link is, as the list and the audit log name it. */
export const slackLinkLabel = (link: {
  slackUserId: string;
  teamId: string;
  teamName?: string | null;
}) => `${link.slackUserId} in ${link.teamName || link.teamId}`;

/**
 * Revokes a Slack link to the scope's workspace: that Slack account's
 * /qr track stops making codes here at once. Owners and admins only; a link
 * of another workspace is reported as missing.
 */
export async function revokeWorkspaceSlackLink(
  scope: ActiveScope,
  linkId: string,
): Promise<void> {
  if (!isSlackBotEnabled()) {
    throw new HttpError(404, "NOT_FOUND", "Slack link not found.");
  }
  if (!canManageSlackLinks(scope)) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Only owners and admins can revoke Slack links.",
    );
  }
  const [link] = await listWorkspaceLinks(scope.organizationId, linkId);
  const removed = link
    ? await deleteWorkspaceLink(scope.organizationId, link.id)
    : null;
  if (!(link && removed)) {
    throw new HttpError(404, "NOT_FOUND", "Slack link not found.");
  }
  recordAuditEvent(scope, {
    action: "slack_link.revoked",
    target: { type: "slack_link", id: link.id, label: slackLinkLabel(link) },
    metadata: { member: link.memberEmail },
  });
}
