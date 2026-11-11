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
import { CpuSetting as ServerCog } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/app/(app)/dashboard/_components/page-header";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { DomainsManager } from "@/app/(app)/dashboard/domains/_components/domains-manager";
import { getDomainsOverview } from "@/app/(app)/dashboard/domains/_lib/domains";
import { UpgradeButton } from "@/app/(app)/dashboard/team/_components/small-actions";
import { InfoHint } from "@/components/help/info-hint";
import { HairlineFigure } from "@/components/mockups/hairline";
import { getDomainConnectOffers } from "@/lib/domain-connect/offers";
import { parseConnectReturn } from "@/lib/domain-connect/return";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { isOwnWorkspaceScope } from "@/lib/own-workspace";
import { PLAN_LIMITS } from "@/lib/plans";
import { PLAN_NAMES } from "@/lib/pricing";
import { SHORT_LINK_BASE } from "@/lib/short-links";

export const metadata: Metadata = {
  title: "Custom domains",
  robots: { index: false, follow: false },
};

const DOCS_HREF = "/docs/custom-domains";

export default async function DomainsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getAppTranslations("app.dashboard.settings.domains.page");
  const scope = await requireDashboardScope();
  const { mode, plan, limit, domains, canManage } =
    await getDomainsOverview(scope);
  const isTeam = !isOwnWorkspaceScope(scope);
  const proLimit = PLAN_LIMITS.pro.customDomains;

  const header = (
    <PageHeader
      description={t("serveYourDynamicQrCodes")}
      title={
        <>
          {t("customDomains")}
          <InfoHint align="start" id="custom-domains" side="bottom" />
        </>
      }
    >
      {mode !== "disabled" && limit > 0 && (
        <Badge variant="outline">
          {t("lengthLimitDomains", { length: domains.length, limit })}
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
            <EmptyTitle>{t("customDomainsArentAvailableRight")}</EmptyTitle>
            <EmptyDescription>{t("youCantConnectANew")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={DOCS_HREF}>{t("howCustomDomainsWork")}</Link>
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
            <HairlineFigure
              className="mx-auto mb-2 h-28 w-40"
              figure="Domain"
            />
            <EmptyTitle>{t("useYourOwnDomainFor")}</EmptyTitle>
            <EmptyDescription>
              {t("withProYourDynamicCodes", {
                host: new URL(SHORT_LINK_BASE).host,
                proLimit,
              })}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {isTeam ? (
              <p className="text-muted-foreground text-sm">
                {t("teamFeaturesFollowThePlan")}
              </p>
            ) : (
              <UpgradeButton />
            )}
            <Link
              className="text-muted-foreground text-xs underline"
              href={DOCS_HREF}
            >
              {t("howCustomDomainsWork")}
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  // One-click DNS setup (Domain Connect) for domains waiting for DNS, where
  // the viewer can verify them. Discovery streams in: the page doesn't wait.
  const oneClick =
    isFeatureAvailable("domainConnect") && canManage && limit > 0;
  const pending = oneClick ? domains.filter((domain) => !domain.verified) : [];
  const connectOffers =
    pending.length > 0 ? getDomainConnectOffers(pending) : undefined;
  const connectReturn = oneClick
    ? parseConnectReturn(await searchParams)
    : null;

  return (
    <div className="space-y-6">
      {header}

      {limit === 0 && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <p className="text-sm">
            {isTeam
              ? t("thisTeamsPlanNoLonger")
              : t("yourPlanNoLongerIncludes")}{" "}
            {t("verifiedDomainsKeepWorkingFor")}
          </p>
          {!isTeam && <UpgradeButton size="sm" />}
        </div>
      )}

      {mode === "manual" && (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          {t.rich("selfHostedModePointEach", {
            link: (chunks) => (
              <Link className="underline" href={DOCS_HREF}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}

      <DomainsManager
        canAdd={limit > 0 && domains.length < limit}
        canManage={canManage}
        canUpgrade={!isTeam}
        connectOffers={connectOffers}
        connectReturn={connectReturn}
        defaultHost={new URL(SHORT_LINK_BASE).host}
        domains={domains}
        limit={limit}
      />
    </div>
  );
}
