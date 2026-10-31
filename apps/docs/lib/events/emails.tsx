import "server-only";

import { database as db, organization, user } from "@repo/database";
import { eq } from "drizzle-orm";
import { invitePath } from "@/app/dashboard/team/_lib/team";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { TeamInviteEmail } from "@/lib/email/templates/team-invite";
import { baseUrl } from "@/lib/metadata";

/**
 * Emails a team invitation (transactional, no unsubscribe). Returns false when
 * email isn't configured or sending failed: the dashboard's copyable invite
 * link stays the fallback either way. Never throws.
 */
export async function sendTeamInviteEmail(invitation: {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  organizationId: string;
  inviterId: string;
}): Promise<boolean> {
  if (!isEmailConfigured) return false;
  try {
    const [[team], [inviter]] = await db.batch([
      db
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, invitation.organizationId))
        .limit(1),
      db
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, invitation.inviterId))
        .limit(1),
    ]);
    if (!team) return false;
    const inviteUrl = new URL(
      invitePath(invitation.id),
      baseUrl.origin,
    ).toString();
    const result = await sendEmail({
      to: invitation.email,
      subject: `${inviter?.name || "A teammate"} invited you to ${team.name} on QRdx`,
      react: (
        <TeamInviteEmail
          expiresAt={invitation.expiresAt}
          inviteUrl={inviteUrl}
          inviterName={inviter?.name || "A teammate"}
          memberRole={invitation.role}
          teamName={team.name}
        />
      ),
      replyTo: inviter?.email,
      // Re-inviting extends the expiry, which sends a fresh email.
      idempotencyKey: `invite:${invitation.id}:${new Date(invitation.expiresAt).getTime()}`,
      tags: [{ name: "category", value: "team_invite" }],
    });
    return result.sent;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "email.invite_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return false;
  }
}
