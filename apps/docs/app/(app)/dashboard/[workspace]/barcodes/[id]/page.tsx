import { Button } from "@repo/design-system/components/ui/button";
import { ArrowLeft } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarcodeActions } from "@/app/(app)/dashboard/barcodes/_components/barcode-actions";
import { BarcodeEditor } from "@/app/(app)/dashboard/barcodes/_components/barcode-editor";
import { folderOptions } from "@/app/(app)/dashboard/barcodes/_lib/cards";
import { formatDate } from "@/app/(app)/dashboard/codes/_components/format";
import { listFolders } from "@/app/(app)/dashboard/codes/_lib/organize";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { ViewOnlyNotice } from "@/components/workspaces/view-only";
import { getBarcodeFormat } from "@/lib/barcode/formats";
import { barcodeLabel, getBarcode } from "@/lib/barcodes/service";
import { HttpError } from "@/lib/error-response";
import { can } from "@/lib/permissions";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "Barcode",
  robots: { index: false, follow: false },
};

/** One saved barcode, in the generator's form: edit, download, save. */
export default async function BarcodePage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const [scope, { workspace: slug, id }] = await Promise.all([
    requireDashboardScope(),
    params,
  ]);
  const [saved, folders] = await Promise.all([
    getBarcode(scope, id).catch((error: unknown) => {
      if (error instanceof HttpError && error.status === 404) notFound();
      throw error;
    }),
    listFolders(scope),
  ]);
  const basePath = workspaceHref(slug, "/barcodes");
  const canWrite = can(scope.role, "content.write");
  const canDelete =
    canWrite &&
    (!scope.organizationId ||
      can(scope.role, "content.manageAll") ||
      saved.createdBy === scope.userId);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Button asChild className="-ml-2" size="sm" variant="ghost">
          <Link href={basePath}>
            <ArrowLeft />
            All barcodes
          </Link>
        </Button>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {barcodeLabel(saved)}
            </h1>
            <p className="text-muted-foreground text-sm">
              {getBarcodeFormat(saved.format).label} · Updated{" "}
              {formatDate(saved.updatedAt)}
            </p>
          </div>
          {canWrite && (
            <BarcodeActions
              basePath={basePath}
              canDelete={canDelete}
              id={saved.id}
            />
          )}
        </div>
        {!canWrite && (
          <ViewOnlyNotice>
            You have view-only access: download this barcode, but it can't be
            changed.
          </ViewOnlyNotice>
        )}
      </div>
      <BarcodeEditor
        basePath={basePath}
        folders={folderOptions(folders)}
        readOnly={!canWrite}
        saved={{
          id: saved.id,
          title: saved.title,
          format: saved.format,
          value: saved.value,
          options: saved.options,
          folderId: saved.folderId,
        }}
      />
    </div>
  );
}
