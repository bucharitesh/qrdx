import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getOwnerPlanForOrganization,
  getPlan,
  getPlanLimits,
} from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { getCurrentUser } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";
import { PageHeader } from "../_components/page-header";
import { CreateTeamDialog } from "./_components/create-team-dialog";
import { DeleteTeamButton, LeaveTeamButton } from "./_components/danger-zone";
import { InviteForm } from "./_components/invite-form";
import { MembersTable } from "./_components/members-table";
import { PendingInvitations } from "./_components/pending-invitations";
import { SwitchTeamButton, UpgradeButton } from "./_components/small-actions";
import {
  getTeam,
  listMyTeams,
  listPendingInvitations,
  listReceivedInvitations,
  listTeamMembers,
} from "./_lib/queries";
import { formatUtcDateTime, invitePath, TEAM_ROLE_LABELS } from "./_lib/team";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false, follow: false },
};

async function requireScope(): Promise<ActiveScope> {
  try {
    return await getActiveScope();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/playground");
    throw error;
  }
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scope = await requireScope();
  const [user, plan, teams, params] = await Promise.all([
    getCurrentUser(),
    getPlan(scope.userId),
    listMyTeams(scope.userId),
    searchParams,
  ]);
  const canCreateTeams = getPlanLimits(plan).teams;
  const received = await listReceivedInvitations(user.email);
  const wantsCreate = params.create === "1";
  const team = scope.organizationId
    ? await getTeam(scope.organizationId)
    : null;
  // The empty state has its own create button.
  const showHeaderCreate = canCreateTeams && (team || teams.length > 0);

  const header = (
    <PageHeader
      description={
        team
          ? "Manage members, roles and invitations for this team."
          : "Teams share dynamic QR codes and team themes with your colleagues."
      }
      title={team ? "Team" : "Teams"}
    >
      {showHeaderCreate && (
        <CreateTeamDialog
          defaultOpen={wantsCreate}
          key={String(wantsCreate)}
          variant="outline"
        />
      )}
    </PageHeader>
  );

  const receivedCard = received.length > 0 && (
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
              className="text-primary text-sm font-medium hover:underline"
              href={invitePath(invite.id)}
            >
              View invitation
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  if (!team) {
    return (
      <div className="space-y-6">
        {header}
        {receivedCard}
        <Card>
          <CardHeader>
            <CardTitle>Your teams</CardTitle>
            <CardDescription>
              You're in your personal workspace. Open a team to work on its
              codes and themes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {teams.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="bg-primary/10 rounded-full p-3">
                  <Users className="text-primary size-6" />
                </div>
                <p className="font-medium">You're not in any team yet</p>
                <p className="text-muted-foreground max-w-md text-sm">
                  {canCreateTeams
                    ? "Create a team, then invite colleagues with a link."
                    : "Creating teams is part of Pro. You can still join a team when someone invites you."}
                </p>
                {canCreateTeams ? (
                  <CreateTeamDialog
                    defaultOpen={wantsCreate}
                    key={String(wantsCreate)}
                  />
                ) : (
                  <UpgradeButton />
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {teams.map((item) => (
                  <div
                    className="flex items-center justify-between gap-2 rounded-md border p-3"
                    key={item.id}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{item.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {TEAM_ROLE_LABELS[item.role]}
                      </div>
                    </div>
                    <SwitchTeamButton organizationId={item.id}>
                      Open team
                    </SwitchTeamButton>
                  </div>
                ))}
                {!canCreateTeams && (
                  <p className="text-muted-foreground pt-2 text-sm">
                    Creating your own teams is part of Pro.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const canManage = scope.role !== "member";
  const [members, invitations, teamPlan] = await Promise.all([
    listTeamMembers(team.id),
    canManage ? listPendingInvitations(team.id) : Promise.resolve([]),
    getOwnerPlanForOrganization(team.id),
  ]);
  const ownerCount = members.filter((m) => m.role === "owner").length;
  const isOnlyOwner = scope.role === "owner" && ownerCount <= 1;

  return (
    <div className="space-y-6">
      {header}
      {receivedCard}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{team.name}</CardTitle>
            <Badge variant="outline">{TEAM_ROLE_LABELS[scope.role]}</Badge>
            <Badge variant={teamPlan !== "free" ? "default" : "secondary"}>
              {PLAN_NAMES[teamPlan]}
            </Badge>
          </div>
          <CardDescription>
            Team URL: <span className="font-mono">{team.slug}</span> ·{" "}
            {members.length} member{members.length === 1 ? "" : "s"}
            {teamPlan === "free" &&
              " · Team limits follow its owners' plan; no owner is on Pro or Business right now. Existing codes keep working."}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
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

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Invite people</CardTitle>
            <CardDescription>
              QRdx doesn't send emails: create an invite link and share it
              yourself. Links expire after 48 hours and only work for the
              invited email address.
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
      )}

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <LeaveTeamButton
            disabledReason={
              isOnlyOwner
                ? "You're the only owner. Make another member an owner before leaving, or delete the team."
                : undefined
            }
            organizationId={team.id}
            teamName={team.name}
          />
          {scope.role === "owner" && (
            <DeleteTeamButton
              organizationId={team.id}
              teamName={team.name}
              teamSlug={team.slug}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
