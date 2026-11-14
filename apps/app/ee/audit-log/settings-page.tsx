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
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { UpgradePlanButton } from "@/app/(app)/dashboard/webhooks/_components/upgrade-plan-button";
import { SettingsHeader } from "@/app/(app)/settings/components/settings-header";
import { getAuditLogAccess } from "@/ee/audit-log/access";
import { AuditLogView } from "@/ee/audit-log/audit-log-view";
import { auditFilterQuery, parseAuditFilter } from "@/ee/audit-log/filter";
import { isMissingTableError } from "@/ee/audit-log/missing-table";
import {
  AUDIT_EXPORT_MAX_ROWS,
  type AuditActorOption,
  type AuditPage,
  listAuditActors,
  listAuditEvents,
} from "@/ee/audit-log/queries";
import { AUDIT_RETENTION_DAYS } from "@/ee/audit-log/retention";
import { isOwnWorkspaceScope } from "@/lib/own-workspace";
import { forbiddenMessage } from "@/lib/permissions";
import { cheapestPlanWith } from "@/lib/plans";
import { type PaidPlan, PLAN_NAMES } from "@/lib/pricing";
import { getActiveWorkspace } from "@/lib/scope";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "Audit log",
  robots: { index: false, follow: false },
};

const DOCS_HREF = "/docs/help/teams/audit-log";

/** Settings → Audit log: who changed what in the workspace (Business). */
export default async function AuditLogSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scope = await requireDashboardScope();
  const [{ workspace }, access, params] = await Promise.all([
    getActiveWorkspace(),
    getAuditLogAccess(scope),
    searchParams,
  ]);
  const plan = (cheapestPlanWith((limits) => limits.auditLog) ??
    "business") as PaidPlan;

  const header = (
    <SettingsHeader
      description="Who changed what in this workspace, and when."
      title="Audit log"
    >
      <Badge variant={access.entitled ? "default" : "secondary"}>
        {PLAN_NAMES[access.plan]}
      </Badge>
      <Button asChild className="max-sm:h-10" size="sm" variant="outline">
        <Link href={DOCS_HREF}>Docs</Link>
      </Button>
    </SettingsHeader>
  );

  if (!access.entitled) {
    return (
      <div className="space-y-6">
        {header}
        <Empty className="border">
          <EmptyHeader>
            <HairlineFigure className="mx-auto mb-2 h-28 w-40" figure="Loupe" />
            <EmptyTitle>The audit log is part of {PLAN_NAMES[plan]}</EmptyTitle>
            <EmptyDescription>
              See who created, changed or deleted codes and pages, who joined or
              left the team, and changes to single sign-on, API keys, webhooks
              and domains, with the time, IP address and device. Filter it and
              export it as CSV.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {isOwnWorkspaceScope(scope) ? (
              <UpgradePlanButton plan={plan} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Team features follow the plan of the team's owners. A team owner
                on {PLAN_NAMES[plan]} turns on the audit log for the team.
              </p>
            )}
            <Link
              className="text-muted-foreground py-2 text-xs underline"
              href={DOCS_HREF}
            >
              What the audit log records
            </Link>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (!access.canView) {
    return (
      <div className="space-y-6">
        {header}
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          {forbiddenMessage(scope.role, "auditLog.view")}
        </p>
      </div>
    );
  }

  const filter = parseAuditFilter(params);
  let page: AuditPage;
  let actors: AuditActorOption[];
  try {
    [page, actors] = await Promise.all([
      listAuditEvents(
        { organizationId: scope.organizationId, slug: workspace.slug },
        filter,
      ),
      listAuditActors(scope.organizationId),
    ]);
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    return (
      <div className="space-y-6">
        {header}
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          The audit log isn't set up on this server yet, so nothing is being
          recorded. The server's operator needs to create its database table.
        </p>
      </div>
    );
  }

  const base = workspaceHref(workspace.slug, "/settings/audit-log");
  const query = auditFilterQuery(filter);
  return (
    <div className="space-y-6">
      {header}
      <AuditLogView
        actors={actors}
        basePath={base}
        exportHref={`${base}/export${query ? `?${query}` : ""}`}
        exportLimit={AUDIT_EXPORT_MAX_ROWS}
        filter={filter}
        initial={page}
        retentionDays={AUDIT_RETENTION_DAYS}
      />
    </div>
  );
}
