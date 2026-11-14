import { HairlineFigure } from "@repo/design-system/components/hairline/hairline";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Add } from "iconsax-reactjs";
import Link from "next/link";
import { use } from "react";
import { UpgradePlanButton } from "@/app/(app)/dashboard/webhooks/_components/upgrade-plan-button";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import type { OAuthAppsOverview } from "@/lib/oauth-apps/service";
import { PLAN_NAMES } from "@/lib/pricing";
import type { WorkspaceSlackLinksState } from "@/lib/slack-bot/admin";
import { SettingsHeader } from "../../components/settings-header";
import { ApiKeysSection, type ApiKeysState } from "./api-keys-section";
import { OAuthAppList } from "./oauth-app-list";
import { SlackLinksSection } from "./slack-links-section";

const QUICKSTART_HREF = "/docs/developers/quickstart";
const INTEGRATION_DOCS_HREF = "/docs/developers/build-an-integration";

/** The open workspace's OAuth apps, for integrations other people install. */
function OAuthAppsSection({
  overview,
  base,
}: {
  overview: OAuthAppsOverview;
  base: string;
}) {
  const t = use(getAppTranslations("app.settings.developers.developersView"));
  const { apps, limit, plan, canManage, isTeam } = overview;
  const atLimit = apps.length >= limit;

  return (
    <section aria-labelledby="oauth-apps-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold" id="oauth-apps-heading">
            {t("oauthApps")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t.rich("letOtherPeopleConnectTheir", {
              link: (chunks) => (
                <Link
                  className="text-foreground underline underline-offset-4"
                  href={INTEGRATION_DOCS_HREF}
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {apps.length} / {limit} {limit === 1 ? t("app") : t("apps")}
          </Badge>
          <Badge variant="secondary">{PLAN_NAMES[plan]}</Badge>
          {canManage &&
            (atLimit ? (
              <Button disabled size="sm" variant="outline">
                <Add />
                {t("newApp")}
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href={`${base}/new`}>
                  <Add />
                  {t("newApp")}
                </Link>
              </Button>
            ))}
        </div>
      </div>

      {!canManage && (
        <p className="text-muted-foreground rounded-xl border p-4 text-sm">
          {t("onlyTeamOwnersCanCreate")}
        </p>
      )}

      {canManage && atLimit && apps.length > 0 && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
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
        <p className="text-muted-foreground rounded-xl border p-4 text-sm">
          {t("noOauthAppsYetYou")}
        </p>
      ) : (
        <OAuthAppList apps={apps} base={base} />
      )}
    </section>
  );
}

/**
 * Settings → API keys & apps: API keys, then OAuth apps, of the open
 * workspace, and for owners and admins the Slack accounts linked to it
 * (where the Slack bot is set up). Creating a key asks "Confirm it's you"
 * first (one dialog for the page).
 */
export function DevelopersView({
  overview,
  keys,
  slackLinks,
  apiBase,
  base,
  openCreate,
}: {
  overview: OAuthAppsOverview;
  keys: ApiKeysState;
  /** Null: not shown (no Slack bot here, or not an owner or admin) */
  slackLinks: WorkspaceSlackLinksState | null;
  apiBase: string;
  /** This page: /dashboard/<workspace>/settings/developers */
  base: string;
  openCreate: boolean;
}) {
  const t = use(getAppTranslations("app.settings.developers.developersView"));
  return (
    <ConfirmIdentityProvider>
      <div className="space-y-10">
        <SettingsHeader
          description={t("apiKeysAndOauthApps")}
          title={t("apiKeysApps")}
        >
          <Button asChild size="sm" variant="outline">
            <Link href={QUICKSTART_HREF}>{t("docs")}</Link>
          </Button>
        </SettingsHeader>

        <ApiKeysSection
          apiBase={apiBase}
          emptyFigure={
            <HairlineFigure className="mx-auto h-24 w-36" figure="Terminal" />
          }
          isTeam={overview.isTeam}
          openCreate={openCreate}
          state={keys}
          workspaceName={overview.workspaceName}
        />

        <OAuthAppsSection base={base} overview={overview} />

        {slackLinks && (
          <SlackLinksSection
            state={slackLinks}
            workspaceName={overview.workspaceName}
          />
        )}
      </div>
    </ConfirmIdentityProvider>
  );
}
