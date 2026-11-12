import { Button } from "@repo/design-system/components/ui/button";
import { ArrowLeft } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarcodeEditor } from "@/app/(app)/dashboard/barcodes/_components/barcode-editor";
import { folderOptions } from "@/app/(app)/dashboard/barcodes/_lib/cards";
import { listFolders } from "@/app/(app)/dashboard/codes/_lib/organize";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { can } from "@/lib/permissions";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "New barcode",
  robots: { index: false, follow: false },
};

export default async function NewBarcodePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const t = await getAppTranslations("app.dashboard.barcodes.new.page");
  const [scope, { workspace: slug }] = await Promise.all([
    requireDashboardScope(),
    params,
  ]);
  // Viewers and billing members can't make anything here.
  if (!can(scope.role, "content.write")) notFound();
  const folders = await listFolders(scope);
  const basePath = workspaceHref(slug, "/barcodes");

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Button asChild className="-ml-2" size="sm" variant="ghost">
          <Link href={basePath}>
            <ArrowLeft />
            {t("allBarcodes")}
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("newBarcode")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("pickTheTypeEnterThe")}
          </p>
        </div>
      </div>
      <BarcodeEditor
        basePath={basePath}
        folders={folderOptions(folders)}
        readOnly={false}
        saved={null}
      />
    </div>
  );
}
