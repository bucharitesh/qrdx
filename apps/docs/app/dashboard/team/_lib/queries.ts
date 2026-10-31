import "server-only";

import {
  database as db,
  invitation,
  member,
  organization,
  user,
} from "@repo/database";
import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { primaryRole, type TeamRole } from "./team";

// Read-only queries; all writes go through the organization plugin API.

export interface TeamSummary {
  id: string;
  name: string;
  slug: string;
  role: TeamRole;
}

export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: TeamRole;
  joinedAt: Date;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: TeamRole;
  expiresAt: Date;
  inviterName: string | null;
}

export interface ReceivedInvitation {
  id: string;
  teamName: string;
  role: TeamRole;
  expiresAt: Date;
}

export async function listMyTeams(userId: string): Promise<TeamSummary[]> {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.name));
  return rows.map((row) => ({ ...row, role: primaryRole(row.role) }));
}

export async function getTeam(organizationId: string) {
  const [row] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row ?? null;
}

export async function listTeamMembers(
  organizationId: string,
): Promise<TeamMember[]> {
  const rows = await db
    .select({
      id: member.id,
      userId: member.userId,
      role: member.role,
      joinedAt: member.createdAt,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(member.createdAt));
  return rows.map((row) => ({ ...row, role: primaryRole(row.role) }));
}

export async function listPendingInvitations(
  organizationId: string,
): Promise<PendingInvitation[]> {
  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      inviterName: user.name,
    })
    .from(invitation)
    .leftJoin(user, eq(user.id, invitation.inviterId))
    .where(
      and(
        eq(invitation.organizationId, organizationId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitation.createdAt));
  return rows.map((row) => ({
    ...row,
    role: primaryRole(row.role ?? "member"),
  }));
}

/** Pending, unexpired invitations addressed to an email. */
export async function listReceivedInvitations(
  email: string,
): Promise<ReceivedInvitation[]> {
  const rows = await db
    .select({
      id: invitation.id,
      teamName: organization.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(
      and(
        sql`lower(${invitation.email}) = ${email.toLowerCase()}`,
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitation.createdAt));
  return rows.map((row) => ({
    ...row,
    role: primaryRole(row.role ?? "member"),
  }));
}

/** Invitation shown on /invite/[id], with its team and inviter. */
export async function getInvitationDetails(invitationId: string) {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      teamName: organization.name,
      inviterName: user.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .leftJoin(user, eq(user.id, invitation.inviterId))
    .where(eq(invitation.id, invitationId))
    .limit(1);
  if (!row) return null;
  return { ...row, role: primaryRole(row.role ?? "member") };
}

export async function isTeamMember(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId)),
    )
    .limit(1);
  return Boolean(row);
}
