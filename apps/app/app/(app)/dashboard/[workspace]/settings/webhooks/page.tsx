import { HairlineFigure } from "@repo/design-system/components/hairline/hairline";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/app/(app)/dashboard/_components/page-header";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { UpgradePlanButton } from "@/app/(app)/dashboard/webhooks/_components/upgrade-plan-button";
import { WebhooksManager } from "@/app/(app)/dashboard/webhooks/_components/webhooks-manager";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { InfoHint } from "@/components/help/info-hint";
import {
  canManageWebhooks,
  listEndpoints,
  webhookPlan,
} from "@/lib/events/endpoints";
import { MAX_WEBHOOK_ENDPOINTS } from "@/lib/events/types";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { isOwnWorkspaceScope } from "@/lib/own-workspace";
import { PLAN_NAMES } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Webhooks",
  robots: { index: false, follow: false },
};

const DOCS_HREF = "/docs/webhooks";

export default async function WebhooksPage() {
  const t = await getAppTranslations("app.dashboard.settings.webhooks.page");
  const scope = await requireDashboardScope();
  const [{ plan, allowed }, endpoints] = await Promise.all([
    webhookPlan(scope),
    listEndpoints(scope),
  ]);
  const isTeam = !isOwnWorkspaceScope(scope);
  const canManage = canManageWebhooks(scope);

  const header = (
    <PageHeader
      description={t("sendScansNewAndChanged")}
      title={
        <>
          {t("webhooks")} <InfoHint align="start" id="webhooks" side="bottom" />
        </>
      }
    >
      {allowed && (
        <Badge variant="outline">
          {t("lengthMaxWebhookEndpointsEndpoints", {
            length: endpoints.length,
            MAX_WEBHOOK_ENDPOINTS,
          })}
        </Badge>
      )}
      <Badge variant={plan === "business" ? "default" : "secondary"}>
        {PLAN_NAMES[plan]}
      </Badge>
      <Button asChild size="sm" variant="outline">
        <Link href={DOCS_HREF}>{t("docs")}</Link>
      </Button>
    </PageHeader>
  );

  if (!allowed && endpoints.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Empty className="border">
          <EmptyHeader>
            <HairlineFigure
              className="mx-auto mb-2 h-28 w-40"
              figure="Webhook"
            />
            <EmptyTitle>{t("webhooksArePartOfBusiness")}</EmptyTitle>
            <EmptyDescription>{t("getASignedHttpsRequest")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {isTeam ? (
              <p className="text-muted-foreground text-sm">
                {t("teamFeaturesFollowThePlan")}
              </p>
            ) : (
              <UpgradePlanButton plan="business" />
            )}
            <Link
              className="text-muted-foreground text-xs underline"
              href={DOCS_HREF}
            >
              {t("howWebhooksWork")}
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {!allowed && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <p className="text-sm">
            {isTeam
              ? t("thisTeamsPlanNoLonger")
              : t("yourPlanNoLongerIncludes")}{" "}
            {t("yourEndpointsAreKeptBut")}
          </p>
          {!isTeam && <UpgradePlanButton plan="business" size="sm" />}
        </div>
      )}

      {!canManage && (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          {t("onlyTeamOwnersAndAdmins")}
        </p>
      )}

      {/* Showing a signing secret asks "Confirm it's you". */}
      <ConfirmIdentityProvider>
        <WebhooksManager
          allowed={allowed}
          canAdd={allowed && endpoints.length < MAX_WEBHOOK_ENDPOINTS}
          canManage={canManage}
          canUpgrade={!isTeam}
          endpoints={endpoints}
        />
      </ConfirmIdentityProvider>
    </div>
  );
}
