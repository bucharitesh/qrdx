import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { ExportSquare } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listFolders } from "@/app/(app)/dashboard/codes/_lib/organize";
import {
  buildFolderTree,
  flattenFolderTree,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getTeam } from "@/app/(app)/dashboard/team/_lib/queries";
import { UpgradePlanButton } from "@/app/(app)/dashboard/webhooks/_components/upgrade-plan-button";
import { SettingsHeader } from "@/app/(app)/settings/components/settings-header";
import { PortalBrandingForm } from "@/components/agency/portal-branding-form";
import { PortalClientsManager } from "@/components/agency/portal-clients-manager";
import { CopyButton } from "@/components/copy-button";
import {
  ClientBrandsUnavailableError,
  findPortalBrand,
} from "@/lib/client-brands";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { can, forbiddenMessage } from "@/lib/permissions";
import { getOwnerPlanForOrganization, getPlanLimits } from "@/lib/plans";
import {
  listPortalClients,
  type PortalClientView,
  PortalUnavailableError,
  portalUrlFor,
} from "@/lib/portal/manage";
import { PLAN_NAMES } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Client portal",
  robots: { index: false, follow: false },
};

const DOCS_HREF = "/docs/client-portal";

/**
 * Settings → Client portal (agency tools, Business): the portal's address
 * and branding, and the clients invited to it with their folders.
 */
export default async function ClientPortalSettingsPage() {
  const t = await getAppTranslations("app.dashboard.settings.clients.page");
  const scope = await requireDashboardScope();
  const [team, plan] = await Promise.all([
    getTeam(scope.organizationId),
    getOwnerPlanForOrganization(scope.organizationId),
  ]);
  if (!team) notFound();
  const allowed = getPlanLimits(plan).clientPortal;
  const canManage = can(scope.role, "members.manage");

  const header = (
    <SettingsHeader
      description={t("giveClientsAReadOnly")}
      title={t("clientPortal")}
    />
  );

  let clients: PortalClientView[] = [];
  let brand = null;
  let unavailable = false;
  if (canManage) {
    try {
      [clients, brand] = await Promise.all([
        listPortalClients(scope),
        findPortalBrand(scope.organizationId),
      ]);
    } catch (error) {
      if (
        error instanceof PortalUnavailableError ||
        error instanceof ClientBrandsUnavailableError
      ) {
        unavailable = true;
      } else {
        throw error;
      }
    }
  }

  if (unavailable) {
    return (
      <div className="space-y-6">
        {header}
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          {t("theClientPortalIsntAvailable")}
        </p>
      </div>
    );
  }

  if (!allowed && clients.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {t("theClientPortalIsPart", { business: PLAN_NAMES.business })}
            </EmptyTitle>
            <EmptyDescription className="text-pretty">
              {t("inviteAClientByEmail")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {can(scope.role, "billing.manage") ? (
              <UpgradePlanButton plan="business" />
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("askAWorkspaceOwnerOr")}
              </p>
            )}
            <Link
              className="text-muted-foreground text-xs underline"
              href={DOCS_HREF}
            >
              {t("howTheClientPortalWorks")}
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="space-y-6">
        {header}
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          {forbiddenMessage(scope.role, "members.manage")}
        </p>
      </div>
    );
  }

  const [portalUrl, folderRows] = await Promise.all([
    portalUrlFor(scope),
    listFolders(scope),
  ]);
  const folders = flattenFolderTree(buildFolderTree(folderRows)).map((row) => ({
    id: row.id,
    name: row.name,
    depth: row.depth,
  }));
  const canEditBrand = can(scope.role, "workspace.update");

  return (
    <div className="space-y-6">
      {header}

      {!allowed && (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <p className="text-sm text-pretty">
            {t("thisWorkspacesPlanNoLonger", { business: PLAN_NAMES.business })}
          </p>
          {can(scope.role, "billing.manage") && (
            <UpgradePlanButton plan="business" size="sm" />
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("portalAddress")}</CardTitle>
          <CardDescription className="text-pretty">
            {t("clientsSignInHereWith")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-1">
          <code className="bg-muted/50 min-w-0 flex-1 truncate rounded-md border px-3 py-2 font-mono text-xs">
            {portalUrl}
          </code>
          <CopyButton
            className="size-9 shrink-0 [&>svg]:size-4"
            successMessage={{ title: t("portalLinkCopied") }}
            textToCopy={portalUrl}
          />
          <Button asChild size="icon" variant="ghost">
            <a
              aria-label={t("openThePortal")}
              href={portalUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExportSquare />
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("branding")}</CardTitle>
          <CardDescription className="text-pretty">
            {t("thePortalShowsThisName")}
            {canEditBrand
              ? ""
              : ` ${forbiddenMessage(scope.role, "workspace.update")}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PortalBrandingForm
            brand={brand}
            canEdit={canEditBrand && allowed}
            fallback={{ name: team.name, logo: team.logo }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("clients")}</CardTitle>
          <CardDescription className="text-pretty">
            {t("clientsArentMembersOfThe")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PortalClientsManager
            canInvite={allowed}
            clients={clients}
            folders={folders}
          />
        </CardContent>
      </Card>
    </div>
  );
}
