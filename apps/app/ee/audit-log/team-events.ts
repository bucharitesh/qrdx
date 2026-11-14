import "server-only";

import type { WorkspaceChange } from "@repo/auth/workspace-audit";
import { changedFields, hasChanges } from "@/ee/audit-log/metadata";
import { type AuditEventInput, recordAuditEvent } from "@/ee/audit-log/record";
import { scheduleWorkspaceAuditCleanup } from "@/ee/audit-log/retention";
import { strongestRole, WORKSPACE_ROLE_LABELS } from "@/lib/permissions";

// Audit log events for the team and the workspace itself.
//
// Changes made through Better Auth's organization plugin (invitations,
// joining, roles, removals, leaving, renaming, deleting) come from
// packages/auth/workspace-audit.ts, which sees every call, over HTTP or from
// a server action, once (recordWorkspaceChange below; registered by
// ./auth-changes.ts). The join link isn't a plugin endpoint, so
// actions/workspace-join.ts records it with auditJoinLink.

type Scope = { userId: string | null; organizationId: string };

const roleLabel = (role: string | null | undefined) =>
  WORKSPACE_ROLE_LABELS[strongestRole(role)];

const member = (userId: string) => ({ type: "member" as const, id: userId });

const JOINED_VIA = {
  invitation: "Invitation",
  added: "Join link",
  sso: "Single sign-on",
} as const;

/** The audit rows for one change the organization plugin made. */
export function workspaceChangeEvents(
  change: WorkspaceChange,
): { ctx: Scope; events: AuditEventInput[] } | null {
  const ctx = (userId: string | null): Scope => ({
    userId,
    organizationId: change.organizationId,
  });
  switch (change.kind) {
    case "invited":
    case "invitation_cancelled":
      return {
        ctx: ctx(change.actorUserId),
        events: [
          {
            action:
              change.kind === "invited"
                ? "member.invited"
                : "invitation.revoked",
            target: {
              type: "invitation",
              id: change.invitation.id,
              label: change.invitation.email || null,
            },
            metadata: { role: roleLabel(change.invitation.role) },
          },
        ],
      };
    case "joined":
      return {
        ctx: ctx(change.userId),
        events: [
          {
            action: "member.joined",
            target: member(change.userId),
            metadata: {
              // add-member is server-only; lib/workspace-join.ts (the join
              // link) is its one caller.
              via: JOINED_VIA[change.via],
              role: roleLabel(change.role),
            },
          },
        ],
      };
    case "role_changed": {
      const metadata = changedFields(
        { role: change.from === null ? null : roleLabel(change.from) },
        { role: roleLabel(change.to) },
      );
      if (!hasChanges(metadata)) return null;
      return {
        ctx: ctx(change.actorUserId),
        events: [
          {
            action: "member.role_changed",
            target: member(change.userId),
            metadata,
          },
        ],
      };
    }
    case "removed":
      return {
        ctx: ctx(change.actorUserId),
        events: [
          {
            action: "member.removed",
            target: member(change.userId),
            metadata: { role: roleLabel(change.role) },
          },
        ],
      };
    case "left":
      return {
        ctx: ctx(change.userId),
        events: [
          {
            action: "member.left",
            target: member(change.userId),
            metadata: { role: roleLabel(change.role) },
          },
        ],
      };
    case "updated": {
      const events: AuditEventInput[] = [];
      const target = {
        type: "workspace" as const,
        id: change.organizationId,
        label: change.after.name,
      };
      if (change.before) {
        const name = changedFields(
          { name: change.before.name },
          { name: change.after.name },
        );
        if (hasChanges(name)) {
          events.push({ action: "workspace.renamed", target, metadata: name });
        }
        const slug = changedFields(
          { slug: change.before.slug },
          { slug: change.after.slug },
        );
        if (hasChanges(slug)) {
          events.push({
            action: "workspace.slug_changed",
            target,
            metadata: slug,
          });
        }
      }
      // A logo or settings change (metadata) isn't one of these.
      return events.length > 0
        ? { ctx: ctx(change.actorUserId), events }
        : null;
    }
    case "deleted":
      return null;
    default:
      return null;
  }
}

/** Records one change the organization plugin made. Never throws. */
export function recordWorkspaceChange(change: WorkspaceChange): void {
  if (change.kind === "deleted") {
    // Its rows go once the workspace is really gone (after the response).
    scheduleWorkspaceAuditCleanup(change.organizationId);
    return;
  }
  const built = workspaceChangeEvents(change);
  if (built) recordAuditEvent(built.ctx, built.events);
}

/** The join link turned on (or reset) with `role`, or turned off. */
export function auditJoinLink(
  scope: Scope,
  action: "join_link.created" | "join_link.disabled",
  role?: string,
): void {
  recordAuditEvent(scope, {
    action,
    target: { type: "join_link", id: scope.organizationId },
    ...(role && { metadata: { role: roleLabel(role) } }),
  });
}

/** The role the join link gives changed. */
export function auditJoinLinkRole(scope: Scope, from: string, to: string) {
  recordAuditEvent(scope, {
    action: "join_link.role_changed",
    target: { type: "join_link", id: scope.organizationId },
    metadata: changedFields({ role: roleLabel(from) }, { role: roleLabel(to) }),
  });
}
