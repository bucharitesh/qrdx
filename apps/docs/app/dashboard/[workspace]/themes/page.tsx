import { isOwnWorkspaceOf } from "@repo/auth/own-workspace-id";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Add as Plus } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/app/dashboard/_components/page-header";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { UpgradeButton } from "@/app/dashboard/team/_components/small-actions";
import { getTeam } from "@/app/dashboard/team/_lib/queries";
import { ThemesManager } from "@/app/dashboard/themes/_components/themes-manager";
import {
  canManageTeamThemes,
  listVisibleThemes,
  teamThemesPlanName,
} from "@/app/dashboard/themes/_lib/queries";
import { can } from "@/lib/permissions";
import { getPlan, getPlanForScope, getPlanLimits } from "@/lib/plans";
import { playgroundHref } from "@/lib/playground-links";
import { PLAN_NAMES } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Themes",
  robots: { index: false, follow: false },
};

export default async function ThemesPage() {
  const scope = await requireDashboardScope();
  // In your own workspace, its themes are yours; elsewhere the workspace's
  // shared themes are listed above yours.
  const ownWorkspace = isOwnWorkspaceOf(scope.organizationId, scope.userId);
  const [themes, personalPlan, scopePlan, team] = await Promise.all([
    listVisibleThemes(scope),
    getPlan(scope.userId),
    getPlanForScope(scope),
    ownWorkspace ? null : getTeam(scope.organizationId),
  ]);

  const personalThemes = themes.filter((theme) => theme.scope === "personal");
  const teamThemes = themes.filter((theme) => theme.scope === "team");
  const limit = getPlanLimits(personalPlan).savedThemes;
  const limited = Number.isFinite(limit);
  const atLimit = personalThemes.length >= limit;

  return (
    <div className="space-y-6">
      <PageHeader
        description={
          team
            ? `Your saved designs and the ones shared with ${team.name}. New codes here start from its default.`
            : "Saved QR designs: colors, patterns and logo. New codes start from your default theme."
        }
        title="Themes"
      >
        <Badge variant="outline">
          {limited
            ? `${personalThemes.length} / ${limit} saved`
            : `${personalThemes.length} saved`}
        </Badge>
        <Badge variant={personalPlan === "free" ? "secondary" : "default"}>
          {PLAN_NAMES[personalPlan]}
        </Badge>
        <Button asChild size="sm">
          <Link href={playgroundHref({ tab: "design" })}>
            <Plus className="size-4" />
            New theme
          </Link>
        </Button>
      </PageHeader>

      {limited && atLimit && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <p className="text-sm">
            The {PLAN_NAMES[personalPlan]} plan includes {limit} saved themes.
            Upgrade to Pro for unlimited themes. Existing themes stay editable.
          </p>
          <UpgradeButton size="sm" />
        </div>
      )}

      <ThemesManager
        personalThemes={personalThemes}
        team={
          team
            ? {
                name: team.name,
                canManage: canManageTeamThemes(scope),
                themesAllowed: getPlanLimits(scopePlan).teamThemes,
                canUpgrade: can(scope.role, "billing.manage"),
                planName: teamThemesPlanName(),
              }
            : null
        }
        teamThemes={teamThemes}
      />
    </div>
  );
}
