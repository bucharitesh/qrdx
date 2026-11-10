import { Button } from "@repo/design-system/components/ui/button";
import { ArrowLeft } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/app/(app)/dashboard/_components/page-header";
import { UsageMeter } from "@/app/(app)/dashboard/codes/_components/usage";
import {
  getCodeUsage,
  requireDashboardScope,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { ImportWizard } from "@/app/(app)/dashboard/codes/import/_components/import-wizard";
import { formatCount, MAX_IMPORT_ROWS } from "@/lib/bulk-limits";
import { plansWith } from "@/lib/plans";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "Import QR codes from CSV",
  robots: { index: false, follow: false },
};

export default async function ImportCodesPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const [scope, { workspace }] = await Promise.all([
    requireDashboardScope(),
    params,
  ]);
  const usage = await getCodeUsage(scope);
  const codes = workspaceHref(workspace, "/codes");

  return (
    <div className="space-y-6">
      <Button asChild size="sm" variant="ghost">
        <Link href={codes}>
          <ArrowLeft />
          All codes
        </Link>
      </Button>
      <PageHeader
        description={`Create up to ${formatCount(MAX_IMPORT_ROWS)} dynamic codes from one CSV, filed into folders and tagged. Every row is checked before anything is created, and a long import can be paused and resumed.`}
        title="Import codes from CSV"
      />
      <UsageMeter usage={usage} />
      <ImportWizard
        basePath={codes}
        bulkPlans={plansWith((limits) => limits.bulkApi)}
        canBulk={usage.bulkApi}
        plan={usage.plan}
        storeKey={`${scope.userId}:${scope.organizationId ?? workspace}`}
      />
    </div>
  );
}
