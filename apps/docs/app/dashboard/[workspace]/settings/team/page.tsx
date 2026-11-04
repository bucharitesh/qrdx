import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { InviteForm } from "@/app/dashboard/team/_components/invite-form";
import {
  JoinLinkCard,
  type JoinLinkView,
} from "@/app/dashboard/team/_components/join-link-card";
import { MembersTable } from "@/app/dashboard/team/_components/members-table";
import { PendingInvitations } from "@/app/dashboard/team/_components/pending-invitations";
import { UpgradeButton } from "@/app/dashboard/team/_components/small-actions";
import {
  getTeam,
  listPendingInvitations,
  listReceivedInvitations,
  listTeamMembers,
} from "@/app/dashboard/team/_lib/queries";
import {
  formatUtcDateTime,
  invitePath,
  TEAM_ROLE_LABELS,
} from "@/app/dashboard/team/_lib/team";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { can, WORKSPACE_ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { getOwnerPlanForOrganization, getPlanLimits } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import { getCurrentUser, logError } from "@/lib/shared";
import { getJoinLink, JoinLinksUnavailableError } from "@/lib/workspace-join";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false, follow: false },
};

/**
 * The join link, or "unavailable" until manual-sql/0014 is applied (or when
 * it can't be read): the rest of the page still works.
 */
async function loadJoinLink(
  organizationId: string,
): Promise<JoinLinkView | null | "unavailable"> {
  try {
    const link = await getJoinLink(organizationId);
    return link
      ? {
          role: link.role,
          createdAt: link.createdAt.toISOString(),
          createdByName: link.createdByName,
        }
      : null;
  } catch (error) {
    if (!(error instanceof JoinLinksUnavailableError)) {
      logError(error as Error, { action: "team.joinLink" });
    }
    return "unavailable";
  }
}

/** The workspace's members, invitations and seats. */
export default async function TeamPage() {
  const scope = await requireDashboardScope();
  const canManage = can(scope.role, "members.manage");
  const [user, team, members, invitations, teamPlan, joinLink] =
    await Promise.all([
      getCurrentUser(),
      getTeam(scope.organizationId),
      listTeamMembers(scope.organizationId),
      canManage
        ? listPendingInvitations(scope.organizationId)
        : Promise.resolve([]),
      getOwnerPlanForOrganization(scope.organizationId),
      canManage ? loadJoinLink(scope.organizationId) : Promise.resolve(null),
    ]);
  if (!team) notFound();
  const received = await listReceivedInvitations(user.email);
  const seats = getPlanLimits(teamPlan).teamMembers;
  const ownWorkspace = isOwnWorkspaceOf(team.id, scope.userId);

  return (
    <div className="space-y-6">
      <SettingsHeader
        description={`Who can work in ${team.name}, and what they can do.`}
        title="Team"
      />

      {received.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Invitations for you</CardTitle>
            <CardDescription>
              Pending invitations sent to {user.email}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {received.map((invite) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                key={invite.id}
              >
                <div>
                  <div className="font-medium">{invite.teamName}</div>
                  <div className="text-muted-foreground text-xs">
                    {TEAM_ROLE_LABELS[invite.role]} · expires{" "}
                    {formatUtcDateTime(invite.expiresAt)}
                  </div>
                </div>
                <Link
                  className="text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
                  href={invitePath(invite.id)}
                >
                  View invitation
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Members</CardTitle>
            <Badge
              title={WORKSPACE_ROLE_DESCRIPTIONS[scope.role]}
              variant="outline"
            >
              {TEAM_ROLE_LABELS[scope.role]}
            </Badge>
            <Badge variant={teamPlan !== "free" ? "default" : "secondary"}>
              {PLAN_NAMES[teamPlan]}
            </Badge>
          </div>
          <CardDescription>
            {members.length} member{members.length === 1 ? "" : "s"}
            {Number.isFinite(seats) ? ` of ${seats}` : ""}. Seats follow the
            plan of the workspace's owners and billing members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MembersTable
            currentRole={scope.role}
            currentUserId={scope.userId}
            members={members.map((m) => ({
              id: m.id,
              userId: m.userId,
              name: m.name,
              email: m.email,
              role: m.role,
              joinedAt: m.joinedAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>

      {canManage &&
        (seats > 1 ? (
          <Card>
            <CardHeader>
              <CardTitle>Invite people</CardTitle>
              <CardDescription>
                Invite links expire after 48 hours and only work for the invited
                email address.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <InviteForm currentRole={scope.role} />
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Pending invitations</h3>
                <PendingInvitations
                  invitations={invitations.map((i) => ({
                    id: i.id,
                    email: i.email,
                    role: i.role,
                    expiresAt: i.expiresAt.toISOString(),
                    inviterName: i.inviterName,
                  }))}
                />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex-col items-start gap-3 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="font-medium">Invite your colleagues</p>
              <p className="text-muted-foreground text-sm text-pretty">
                {ownWorkspace || can(scope.role, "billing.manage")
                  ? `Members are part of ${PLAN_NAMES.pro} and ${PLAN_NAMES.business}.`
                  : "Ask a workspace owner or billing member to upgrade to add members."}
              </p>
            </div>
            {can(scope.role, "billing.manage") && <UpgradeButton size="sm" />}
          </Card>
        ))}

      {canManage && seats > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Join link</CardTitle>
            <CardDescription className="text-pretty">
              One link for the whole team: anyone signed in who opens it joins
              this workspace, while it has free seats. Reset it or turn it off
              any time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {joinLink === "unavailable" ? (
              <p className="text-muted-foreground text-sm">
                Join links aren't set up on this server yet. Invite people by
                email for now.
              </p>
            ) : (
              <JoinLinkCard currentRole={scope.role} link={joinLink} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
