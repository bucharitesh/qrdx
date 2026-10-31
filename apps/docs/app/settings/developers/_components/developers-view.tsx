import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Add } from "iconsax-reactjs";
import Link from "next/link";
import { UpgradePlanButton } from "@/app/dashboard/webhooks/_components/upgrade-plan-button";
import { HairlineFigure } from "@/components/mockups/hairline";
import type { OAuthAppsOverview } from "@/lib/oauth-apps/service";
import { PLAN_NAMES } from "@/lib/pricing";
import { SettingsHeader } from "../../components/settings-header";
import { OAuthAppList } from "./oauth-app-list";

const DOCS_HREF = "/docs/developers/build-an-integration";

/** Settings → Developers: the active workspace's OAuth apps. */
export function DevelopersView({ overview }: { overview: OAuthAppsOverview }) {
  const { apps, limit, plan, canManage, isTeam, workspaceName } = overview;
  const atLimit = apps.length >= limit;

  return (
    <div className="space-y-6">
      <SettingsHeader
        description="Build an integration: register OAuth apps that call the QRdx API for the people who authorize them."
        title="Developers"
      >
        <Button asChild size="sm" variant="outline">
          <Link href={DOCS_HREF}>Docs</Link>
        </Button>
        {canManage &&
          apps.length > 0 &&
          (atLimit ? (
            <Button disabled size="sm">
              <Add />
              New app
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/settings/developers/new">
                <Add />
                New app
              </Link>
            </Button>
          ))}
      </SettingsHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          OAuth apps in{" "}
          <span className="text-foreground font-medium">{workspaceName}</span>
          {isTeam ? ". Switch workspaces in the sidebar." : "."}
        </p>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {apps.length} / {limit} {limit === 1 ? "app" : "apps"}
          </Badge>
          <Badge variant="secondary">{PLAN_NAMES[plan]}</Badge>
        </div>
      </div>

      {!canManage && (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          Only team owners can create, edit or delete the team's OAuth apps.
        </p>
      )}

      {canManage && atLimit && apps.length > 0 && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <p className="text-sm">
            {isTeam
              ? `This team's plan includes ${limit === 1 ? "1 app" : `${limit} apps`}. A team owner on a higher plan raises the limit.`
              : `Your ${PLAN_NAMES[plan]} plan includes ${limit === 1 ? "1 app" : `${limit} apps`}. Upgrade for more.`}
          </p>
          {!isTeam && plan !== "business" && (
            <UpgradePlanButton
              plan={plan === "free" ? "pro" : "business"}
              size="sm"
            />
          )}
        </div>
      )}

      {apps.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <HairlineFigure className="mx-auto mb-2 h-28 w-40" figure="Relay" />
            <EmptyTitle>No OAuth apps yet</EmptyTitle>
            <EmptyDescription>
              Create an app to get a client ID and secret. People install it by
              approving your app on the QRdx consent screen; your server then
              calls the REST API with their access token.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {canManage && (
              <Button asChild>
                <Link href="/settings/developers/new">
                  <Add />
                  New app
                </Link>
              </Button>
            )}
            <Link
              className="text-muted-foreground text-xs underline"
              href={DOCS_HREF}
            >
              Read the quickstart
            </Link>
          </EmptyContent>
        </Empty>
      ) : (
        <OAuthAppList apps={apps} />
      )}
    </div>
  );
}
