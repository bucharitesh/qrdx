import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlan, getPlanForScope, getPlanLimits } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { UnauthorizedError } from "@/types/errors";
import { PageHeader } from "../_components/page-header";
import { UpgradeButton } from "../team/_components/small-actions";
import { getTeam } from "../team/_lib/queries";
import { ThemesManager } from "./_components/themes-manager";
import {
  canManageTeamThemes,
  listVisibleThemes,
  teamThemesPlanName,
} from "./_lib/queries";

export const metadata: Metadata = {
  title: "Themes",
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

export default async function ThemesPage() {
  const scope = await requireScope();
  const [themes, personalPlan, scopePlan, team] = await Promise.all([
    listVisibleThemes(scope),
    getPlan(scope.userId),
    getPlanForScope(scope),
    scope.organizationId ? getTeam(scope.organizationId) : null,
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
            ? `Your saved designs and the ones shared with ${team.name}. New codes in this team start from the team default.`
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
          <Link href="/playground?tab=customisations">
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
                canUpgrade: scope.role === "owner",
                planName: teamThemesPlanName(),
              }
            : null
        }
        teamThemes={teamThemes}
      />
    </div>
  );
}
