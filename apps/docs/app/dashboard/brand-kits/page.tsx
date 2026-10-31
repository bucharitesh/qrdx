import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { UnauthorizedError } from "@/types/errors";
import { PageHeader } from "../_components/page-header";
import { UpgradeButton } from "../team/_components/small-actions";
import { getTeam } from "../team/_lib/queries";
import { BrandKitsManager } from "./_components/brand-kits-manager";
import { listBrandKitsInScope } from "./_lib/queries";

export const metadata: Metadata = {
  title: "Brand kits",
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

export default async function BrandKitsPage() {
  const scope = await requireScope();
  const [kits, plan, team] = await Promise.all([
    listBrandKitsInScope(scope),
    getPlanForScope(scope),
    scope.organizationId ? getTeam(scope.organizationId) : null,
  ]);
  const limit = getPlanLimits(plan).brandKits;
  const limited = Number.isFinite(limit);
  const canCreate = kits.length < limit;

  return (
    <div className="space-y-6">
      <PageHeader
        description={
          team
            ? `Shared with everyone in ${team.name}.`
            : "Your personal logos, colors and patterns."
        }
        title="Brand kits"
      >
        <Badge variant="outline">
          {limited
            ? `${kits.length} / ${limit} brand kit${limit === 1 ? "" : "s"}`
            : `${kits.length} brand kit${kits.length === 1 ? "" : "s"}`}
        </Badge>
        <Badge variant={plan === "pro" ? "default" : "secondary"}>
          {plan === "pro" ? "Pro" : "Free"}
        </Badge>
      </PageHeader>

      {!canCreate && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <p className="text-sm">
            {team
              ? `This team's plan includes ${limit} brand kit${limit === 1 ? "" : "s"} (team limits follow its owners' plan).`
              : `The Free plan includes ${limit} brand kit${limit === 1 ? "" : "s"}. Upgrade to Pro for unlimited kits.`}{" "}
            Existing kits stay editable.
          </p>
          {!team && <UpgradeButton size="sm" />}
        </div>
      )}

      <BrandKitsManager canCreate={canCreate} canUpgrade={!team} kits={kits} />
    </div>
  );
}
