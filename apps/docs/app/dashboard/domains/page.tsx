import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Globe, ServerCog } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/app/dashboard/_components/page-header";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { UpgradeButton } from "@/app/dashboard/team/_components/small-actions";
import { PLAN_LIMITS } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import { SHORT_LINK_BASE } from "@/lib/short-links";
import { DomainsManager } from "./_components/domains-manager";
import { getDomainsOverview } from "./_lib/domains";

export const metadata: Metadata = {
  title: "Custom domains",
  robots: { index: false, follow: false },
};

const DOCS_HREF = "/docs/custom-domains";

export default async function DomainsPage() {
  const scope = await requireDashboardScope();
  const { mode, plan, limit, domains, canManage } =
    await getDomainsOverview(scope);
  const isTeam = Boolean(scope.organizationId);
  const proLimit = PLAN_LIMITS.pro.customDomains;

  const header = (
    <PageHeader
      description="Serve your dynamic QR codes from a domain you own, like go.yourbrand.com/aB3dE5f."
      title="Custom domains"
    >
      {mode !== "disabled" && limit > 0 && (
        <Badge variant="outline">
          {domains.length} / {limit} domains
        </Badge>
      )}
      <Badge variant={plan !== "free" ? "default" : "secondary"}>
        {PLAN_NAMES[plan]}
      </Badge>
    </PageHeader>
  );

  if (mode === "disabled") {
    return (
      <div className="space-y-6">
        {header}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ServerCog />
            </EmptyMedia>
            <EmptyTitle>
              Custom domains aren't set up on this deployment
            </EmptyTitle>
            <EmptyDescription>
              Connecting domains here needs access to the Vercel Domains API.
              The operator can enable it by setting VERCEL_API_TOKEN and
              VERCEL_PROJECT_ID. Your existing codes and short links keep
              working.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={DOCS_HREF}>How custom domains work</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (limit === 0 && domains.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Globe />
            </EmptyMedia>
            <EmptyTitle>Use your own domain for QR codes</EmptyTitle>
            <EmptyDescription>
              With Pro, your dynamic codes can open short links on your own
              domain instead of {new URL(SHORT_LINK_BASE).host}, so people see
              your brand before they scan. Up to {proLimit} domains, with the
              same scan analytics.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {isTeam ? (
              <p className="text-muted-foreground text-sm">
                Team features follow the plan of the team's owners. A team owner
                on Pro or Business unlocks custom domains for the team.
              </p>
            ) : (
              <UpgradeButton />
            )}
            <Link
              className="text-muted-foreground text-xs underline"
              href={DOCS_HREF}
            >
              How custom domains work
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {limit === 0 && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <p className="text-sm">
            {isTeam
              ? "This team's plan no longer includes custom domains."
              : "Your plan no longer includes custom domains."}{" "}
            Verified domains keep working for the codes that use them. Adding or
            verifying domains needs Pro.
          </p>
          {!isTeam && <UpgradeButton size="sm" />}
        </div>
      )}

      {mode === "manual" && (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          Self-hosted mode: point each domain at this server yourself (DNS and
          your reverse proxy), then prove you own it with the TXT record shown
          below.{" "}
          <Link className="underline" href={DOCS_HREF}>
            Setup guide
          </Link>
        </p>
      )}

      <DomainsManager
        canAdd={limit > 0 && domains.length < limit}
        canManage={canManage}
        canUpgrade={!isTeam}
        defaultHost={new URL(SHORT_LINK_BASE).host}
        domains={domains}
        limit={limit}
      />
    </div>
  );
}
