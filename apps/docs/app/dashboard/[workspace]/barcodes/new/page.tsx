import { Button } from "@repo/design-system/components/ui/button";
import { ArrowLeft } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarcodeEditor } from "@/app/dashboard/barcodes/_components/barcode-editor";
import { folderOptions } from "@/app/dashboard/barcodes/_lib/cards";
import { listFolders } from "@/app/dashboard/codes/_lib/organize";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
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
            All barcodes
          </Link>
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">New barcode</h1>
          <p className="text-muted-foreground text-sm">
            Pick the type, enter the number or text, and save it to edit and
            download again later.
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
