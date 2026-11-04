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
import { WorkspaceAvatar } from "@/components/workspaces/workspace-avatar";
import { WorkspaceGeneralForm } from "@/components/workspaces/workspace-general-form";
import { WorkspaceLogoField } from "@/components/workspaces/workspace-logo-field";
import { can, forbiddenMessage } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Workspace settings",
  robots: { index: false, follow: false },
};

/** The open workspace's name, URL and logo, and leaving or deleting it. */
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
  const canEdit = can(scope.role, "workspace.update");

  return (
    <div className="space-y-6">
      <SettingsHeader
        description="The workspace's name, logo and its address in the dashboard."
        title={
          <span className="flex min-w-0 items-center gap-3">
            <WorkspaceAvatar logo={team.logo} name={team.name} size="md" />
            <span className="truncate">General</span>
          </span>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          {!canEdit && (
            <CardDescription>
              {forbiddenMessage(scope.role, "workspace.update")}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <WorkspaceLogoField
            canEdit={canEdit}
            logo={team.logo}
            name={team.name}
          />
          <WorkspaceGeneralForm
            canEdit={canEdit}
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
            {can(scope.role, "workspace.delete") && !someonesOwn && (
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
