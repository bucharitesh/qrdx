import { MAX_IMPORT_ROWS } from "@repo/config";
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
import { formatCount } from "@/lib/format-count";
import { getAppTranslations } from "@/lib/i18n/app-locale";
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
  const t = await getAppTranslations("app.dashboard.codes.import.page");
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
          {t("allCodes")}
        </Link>
      </Button>
      <PageHeader
        description={t("createUpToMaxImport", {
          MAX_IMPORT_ROWS: formatCount(MAX_IMPORT_ROWS),
        })}
        title={t("importCodesFromCsv")}
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
