import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
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
import {
  DeleteTeamButton,
  LeaveTeamButton,
} from "@/app/dashboard/team/_components/danger-zone";
import { getTeam, listTeamMembers } from "@/app/dashboard/team/_lib/queries";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { WorkspaceGeneralForm } from "@/components/workspaces/workspace-general-form";

export const metadata: Metadata = {
  title: "Workspace settings",
  robots: { index: false, follow: false },
};

/** The open workspace's name and URL, and leaving or deleting it. */
export default async function WorkspaceSettingsPage() {
  const scope = await requireDashboardScope();
  const [team, members] = await Promise.all([
    getTeam(scope.organizationId),
    listTeamMembers(scope.organizationId),
  ]);
  if (!team) notFound();
  const ownWorkspace = isOwnWorkspaceOf(team.id, scope.userId);
  const owners = members.filter((m) => m.role === "owner").length;
  const isOnlyOwner = scope.role === "owner" && owners <= 1;
  // Someone else's own workspace can't be deleted either.
  const someonesOwn = members.some((m) => isOwnWorkspaceOf(team.id, m.userId));

  return (
    <div className="space-y-6">
      <SettingsHeader
        description="The workspace's name and its address in the dashboard."
        title="General"
      />

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          {scope.role === "member" && (
            <CardDescription>
              Only owners and admins can change these.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <WorkspaceGeneralForm
            canEdit={scope.role !== "member"}
            name={team.name}
            slug={team.slug}
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          {ownWorkspace && (
            <CardDescription>
              This is your own workspace, so it can't be left or deleted. It
              goes when you{" "}
              <Link className="underline" href="/settings/account">
                delete your account
              </Link>
              .
            </CardDescription>
          )}
        </CardHeader>
        {!ownWorkspace && (
          <CardContent className="flex flex-wrap items-center gap-3">
            <LeaveTeamButton
              disabledReason={
                isOnlyOwner
                  ? "You're the only owner. Make another member an owner before leaving, or delete the workspace."
                  : undefined
              }
              organizationId={team.id}
              teamName={team.name}
            />
            {scope.role === "owner" && !someonesOwn && (
              <DeleteTeamButton
                organizationId={team.id}
                teamName={team.name}
                teamSlug={team.slug}
              />
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
