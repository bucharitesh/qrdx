import "server-only";

import {
  database as db,
  invitation,
  member,
  organization,
} from "@repo/database";
import { and, eq } from "drizzle-orm";
import { changedFields, hasChanges } from "@/ee/audit-log/metadata";
import { recordAuditEvent } from "@/ee/audit-log/record";
import { strongestRole, WORKSPACE_ROLE_LABELS } from "@/lib/permissions";

// Audit log events for the team and the workspace itself, so the actions in
// actions/organizations.ts and actions/workspace-join.ts (which go through
// Better Auth's organization plugin) each record with one line after the
// change succeeded.

type Scope = { userId: string; organizationId: string };

const roleLabel = (role: string | null | undefined) =>
  WORKSPACE_ROLE_LABELS[strongestRole(role)];

/** The workspace's name and URL before a change (updateWorkspace). */
export async function workspaceBefore(
  organizationId: string,
): Promise<{ name: string; slug: string } | null> {
  try {
    const [row] = await db
      .select({ name: organization.name, slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

/** Renamed and/or new URL. */
export function auditWorkspaceUpdated(
  scope: Scope,
  before: { name: string; slug: string } | null,
  data: { name?: unknown; slug?: unknown },
): void {
  if (!before) return;
  const events = [];
  const name = changedFields({ name: before.name }, { name: data.name });
  if (typeof data.name === "string" && hasChanges(name)) {
    events.push({ action: "workspace.renamed" as const, metadata: name });
  }
  const slug = changedFields({ slug: before.slug }, { slug: data.slug });
  if (typeof data.slug === "string" && hasChanges(slug)) {
    events.push({ action: "workspace.slug_changed" as const, metadata: slug });
  }
  const target = {
    type: "workspace" as const,
    id: scope.organizationId,
    label: typeof data.name === "string" ? data.name : before.name,
  };
  recordAuditEvent(
    scope,
    events.map((event) => ({ ...event, target })),
  );
}

export function auditInvited(
  scope: Scope,
  invite: { id: string; email: string; role: string },
): void {
  recordAuditEvent(scope, {
    action: "member.invited",
    target: { type: "invitation", id: invite.id, label: invite.email },
    metadata: { role: roleLabel(invite.role) },
  });
}

export function auditInvitationRevoked(scope: Scope, invitationId: string) {
  recordAuditEvent(scope, async () => {
    const [row] = await db
      .select({ email: invitation.email, role: invitation.role })
      .from(invitation)
      .where(eq(invitation.id, invitationId))
      .limit(1);
    return [
      {
        action: "invitation.revoked",
        target: {
          type: "invitation",
          id: invitationId,
          label: row?.email ?? null,
        },
        ...(row?.role && { metadata: { role: roleLabel(row.role) } }),
      },
    ];
  });
}

export function auditRoleChanged(
  scope: Scope,
  person: { userId: string; role: string } | null,
  role: string,
): void {
  if (!person) return;
  const change = changedFields(
    { role: roleLabel(person.role) },
    { role: roleLabel(role) },
  );
  if (!hasChanges(change)) return;
  recordAuditEvent(scope, {
    action: "member.role_changed",
    target: { type: "member", id: person.userId },
    metadata: change,
  });
}

export function auditMemberRemoved(
  scope: Scope,
  person: { userId: string; role: string } | null,
): void {
  if (!person) return;
  recordAuditEvent(scope, {
    action: "member.removed",
    target: { type: "member", id: person.userId },
    metadata: { role: roleLabel(person.role) },
  });
}

/** The person left `organizationId` themselves. */
export function auditMemberLeft(userId: string, organizationId: string) {
  recordAuditEvent(
    { userId, organizationId },
    { action: "member.left", target: { type: "member", id: userId } },
  );
}

/** The person joined `organizationId`: an invitation or the join link. */
export function auditMemberJoined(
  userId: string,
  organizationId: string,
  via: "invitation" | "join link",
  role?: string,
): void {
  recordAuditEvent({ userId, organizationId }, async () => {
    let joinedAs = role;
    if (!joinedAs) {
      const [row] = await db
        .select({ role: member.role })
        .from(member)
        .where(
          and(
            eq(member.organizationId, organizationId),
            eq(member.userId, userId),
          ),
        )
        .limit(1);
      joinedAs = row?.role;
    }
    return [
      {
        action: "member.joined",
        target: { type: "member", id: userId },
        metadata: {
          via: via === "invitation" ? "Invitation" : "Join link",
          ...(joinedAs && { role: roleLabel(joinedAs) }),
        },
      },
    ];
  });
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
