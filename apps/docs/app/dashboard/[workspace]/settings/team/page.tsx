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
import { getOwnerPlanForOrganization, getPlanLimits } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import { getCurrentUser } from "@/lib/shared";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false, follow: false },
};

/** The workspace's members, invitations and seats. */
export default async function TeamPage() {
  const scope = await requireDashboardScope();
  const canManage = scope.role !== "member";
  const [user, team, members, invitations, teamPlan] = await Promise.all([
    getCurrentUser(),
    getTeam(scope.organizationId),
    listTeamMembers(scope.organizationId),
    canManage
      ? listPendingInvitations(scope.organizationId)
      : Promise.resolve([]),
    getOwnerPlanForOrganization(scope.organizationId),
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
            <Badge variant="outline">{TEAM_ROLE_LABELS[scope.role]}</Badge>
            <Badge variant={teamPlan !== "free" ? "default" : "secondary"}>
              {PLAN_NAMES[teamPlan]}
            </Badge>
          </div>
          <CardDescription>
            {members.length} member{members.length === 1 ? "" : "s"}
            {Number.isFinite(seats) ? ` of ${seats}` : ""}. Seats follow the
            plan of the workspace's owners.
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
              <InviteForm />
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
                {ownWorkspace || scope.role === "owner"
                  ? `Members are part of ${PLAN_NAMES.pro} and ${PLAN_NAMES.business}.`
                  : "Ask a workspace owner to upgrade to add members."}
              </p>
            </div>
            {scope.role === "owner" && <UpgradeButton size="sm" />}
          </Card>
        ))}
    </div>
  );
}
