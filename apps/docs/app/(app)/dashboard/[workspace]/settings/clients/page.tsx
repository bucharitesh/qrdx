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
      description="Give clients a read-only view of the folders you choose, under your own name and logo."
      title="Client portal"
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
          The client portal isn't available on this server yet.
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
              The client portal is part of {PLAN_NAMES.business}
            </EmptyTitle>
            <EmptyDescription className="text-pretty">
              Invite a client by email and choose the folders they see: their
              codes, scan analytics and hosted pages, read-only, under your
              name, logo and color.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {can(scope.role, "billing.manage") ? (
              <UpgradePlanButton plan="business" />
            ) : (
              <p className="text-muted-foreground text-sm">
                Ask a workspace owner or billing member to upgrade.
              </p>
            )}
            <Link
              className="text-muted-foreground text-xs underline"
              href={DOCS_HREF}
            >
              How the client portal works
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
            This workspace's plan no longer includes the client portal. Clients
            can't open it until the workspace is on {PLAN_NAMES.business} again.
            You can still remove them.
          </p>
          {can(scope.role, "billing.manage") && (
            <UpgradePlanButton plan="business" size="sm" />
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Portal address</CardTitle>
          <CardDescription className="text-pretty">
            Clients sign in here with a one-time code sent to the address you
            invited. They see only their folders, and can't change anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-1">
          <code className="bg-muted/50 min-w-0 flex-1 truncate rounded-md border px-3 py-2 font-mono text-xs">
            {portalUrl}
          </code>
          <CopyButton
            className="size-9 shrink-0 [&>svg]:size-4"
            successMessage={{ title: "Portal link copied" }}
            textToCopy={portalUrl}
          />
          <Button asChild size="icon" variant="ghost">
            <a
              aria-label="Open the portal"
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
          <CardTitle>Branding</CardTitle>
          <CardDescription className="text-pretty">
            The portal shows this name, logo and color instead of QRdx.
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
          <CardTitle>Clients</CardTitle>
          <CardDescription className="text-pretty">
            Clients aren't members of the workspace and don't take a seat.
            Removing one takes their access away at once.
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
