import { Button } from "@repo/design-system/components/ui/button";
import { ArrowLeft } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/app/dashboard/_components/page-header";
import { UsageMeter } from "@/app/dashboard/codes/_components/usage";
import {
  getCodeUsage,
  requireDashboardScope,
} from "@/app/dashboard/codes/_lib/qr-codes";
import { plansWith } from "@/lib/plans";
import { ImportWizard } from "./_components/import-wizard";

export const metadata: Metadata = {
  title: "Import QR codes from CSV",
  robots: { index: false, follow: false },
};

export default async function ImportCodesPage() {
  const scope = await requireDashboardScope("/dashboard/codes/import");
  const usage = await getCodeUsage(scope);

  return (
    <div className="space-y-6">
      <Button asChild size="sm" variant="ghost">
        <Link href="/dashboard/codes">
          <ArrowLeft />
          All codes
        </Link>
      </Button>
      <PageHeader
        description="Create many dynamic codes at once, filed into folders and tagged. Check every row before anything is created."
        title="Import codes from CSV"
      />
      <UsageMeter usage={usage} />
      <ImportWizard
        basePath="/dashboard/codes"
        bulkPlans={plansWith((limits) => limits.bulkApi)}
        canBulk={usage.bulkApi}
        plan={usage.plan}
      />
    </div>
  );
}
