import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Add } from "iconsax-reactjs";
import Link from "next/link";
import { UpgradePlanButton } from "@/app/dashboard/webhooks/_components/upgrade-plan-button";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { HairlineFigure } from "@/components/mockups/hairline";
import type { OAuthAppsOverview } from "@/lib/oauth-apps/service";
import { PLAN_NAMES } from "@/lib/pricing";
import { SettingsHeader } from "../../components/settings-header";
import { ApiKeysSection, type ApiKeysState } from "./api-keys-section";
import { OAuthAppList } from "./oauth-app-list";

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
  const { apps, limit, plan, canManage, isTeam } = overview;
  const atLimit = apps.length >= limit;

  return (
    <section aria-labelledby="oauth-apps-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold" id="oauth-apps-heading">
            OAuth apps
          </h2>
          <p className="text-muted-foreground text-sm">
            Let other people connect their QRdx account to your product.{" "}
            <Link
              className="text-foreground underline underline-offset-4"
              href={INTEGRATION_DOCS_HREF}
            >
              Guide
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {apps.length} / {limit} {limit === 1 ? "app" : "apps"}
          </Badge>
          <Badge variant="secondary">{PLAN_NAMES[plan]}</Badge>
          {canManage &&
            (atLimit ? (
              <Button disabled size="sm" variant="outline">
                <Add />
                New app
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href={`${base}/new`}>
                  <Add />
                  New app
                </Link>
              </Button>
            ))}
        </div>
      </div>

      {!canManage && (
        <p className="text-muted-foreground rounded-xl border p-4 text-sm">
          Only team owners can create, edit or delete the team's OAuth apps.
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
          No OAuth apps yet. You only need one to act for other QRdx users.
        </p>
      ) : (
        <OAuthAppList apps={apps} base={base} />
      )}
    </section>
  );
}

/**
 * Settings → API keys & apps: API keys, then OAuth apps, of the open
 * workspace. Creating a key asks "Confirm it's you" first (one dialog for the
 * page).
 */
export function DevelopersView({
  overview,
  keys,
  apiBase,
  base,
  openCreate,
}: {
  overview: OAuthAppsOverview;
  keys: ApiKeysState;
  apiBase: string;
  /** This page: /dashboard/<workspace>/settings/developers */
  base: string;
  openCreate: boolean;
}) {
  return (
    <ConfirmIdentityProvider>
      <div className="space-y-10">
        <SettingsHeader
          description="API keys and OAuth apps for the QRdx REST API."
          title="API keys & apps"
        >
          <Button asChild size="sm" variant="outline">
            <Link href={QUICKSTART_HREF}>Docs</Link>
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
      </div>
    </ConfirmIdentityProvider>
  );
}
