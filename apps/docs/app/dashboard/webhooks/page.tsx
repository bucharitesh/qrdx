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
import { PageHeader } from "@/app/dashboard/_components/page-header";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { InfoHint } from "@/components/help/info-hint";
import { HairlineFigure } from "@/components/mockups/hairline";
import {
  canManageWebhooks,
  listEndpoints,
  webhookPlan,
} from "@/lib/events/endpoints";
import { MAX_WEBHOOK_ENDPOINTS } from "@/lib/events/types";
import { PLAN_NAMES } from "@/lib/pricing";
import { UpgradePlanButton } from "./_components/upgrade-plan-button";
import { WebhooksManager } from "./_components/webhooks-manager";

export const metadata: Metadata = {
  title: "Webhooks",
  robots: { index: false, follow: false },
};

const DOCS_HREF = "/docs/webhooks";

export default async function WebhooksPage() {
  const scope = await requireDashboardScope();
  const [{ plan, allowed }, endpoints] = await Promise.all([
    webhookPlan(scope),
    listEndpoints(scope),
  ]);
  const isTeam = Boolean(scope.organizationId);
  const canManage = canManageWebhooks(scope);

  const header = (
    <PageHeader
      description="Send scans, new and changed codes, and form responses to your own server, Zapier or Make."
      title={
        <>
          Webhooks <InfoHint align="start" id="webhooks" side="bottom" />
        </>
      }
    >
      {allowed && (
        <Badge variant="outline">
          {endpoints.length} / {MAX_WEBHOOK_ENDPOINTS} endpoints
        </Badge>
      )}
      <Badge variant={plan === "business" ? "default" : "secondary"}>
        {PLAN_NAMES[plan]}
      </Badge>
      <Button asChild size="sm" variant="outline">
        <Link href={DOCS_HREF}>Docs</Link>
      </Button>
    </PageHeader>
  );

  if (!allowed && endpoints.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Empty className="border">
          <EmptyHeader>
            <HairlineFigure className="mx-auto mb-2 h-28 w-40" figure="Plug" />
            <EmptyTitle>Webhooks are part of Business</EmptyTitle>
            <EmptyDescription>
              Get a signed HTTPS request the moment something happens: scans
              (batched every minute), scan milestones, new or changed codes and
              form submissions. Connect Zapier, Make or n8n with REST hooks, and
              post alerts to Slack or Discord.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {isTeam ? (
              <p className="text-muted-foreground text-sm">
                Team features follow the plan of the team's owners. A team owner
                on Business unlocks webhooks for the team.
              </p>
            ) : (
              <UpgradePlanButton plan="business" />
            )}
            <Link
              className="text-muted-foreground text-xs underline"
              href={DOCS_HREF}
            >
              How webhooks work
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
              ? "This team's plan no longer includes webhooks."
              : "Your plan no longer includes webhooks."}{" "}
            Your endpoints are kept but nothing is sent until the workspace is
            on Business again. You can still delete them.
          </p>
          {!isTeam && <UpgradePlanButton plan="business" size="sm" />}
        </div>
      )}

      {!canManage && (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          Only team owners and admins can add, change or test endpoints.
        </p>
      )}

      <WebhooksManager
        allowed={allowed}
        canAdd={allowed && endpoints.length < MAX_WEBHOOK_ENDPOINTS}
        canManage={canManage}
        canUpgrade={!isTeam}
        endpoints={endpoints}
      />
    </div>
  );
}
