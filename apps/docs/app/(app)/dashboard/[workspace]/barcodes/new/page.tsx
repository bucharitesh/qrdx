import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BarcodesListView } from "@/app/(app)/dashboard/barcodes/_components/barcodes-list-view";
import { OpenNewBarcode } from "@/app/(app)/dashboard/barcodes/_components/open-new-barcode";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { can } from "@/lib/permissions";
import { workspaceHref } from "@/lib/workspace-paths";

// The list it closes to: the address changes to /barcodes then.
export const metadata: Metadata = {
  title: "Barcodes",
  robots: { index: false, follow: false },
};

/**
 * New barcodes are made in a modal; this address (old links and bookmarks)
 * shows the Barcodes list with it open.
 */
export default async function NewBarcodePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [scope, { workspace: slug }, query] = await Promise.all([
    requireDashboardScope(),
    params,
    searchParams,
  ]);
  // Viewers and billing members can't make anything here.
  if (!can(scope.role, "content.write")) notFound();

  return (
    <>
      <BarcodesListView searchParams={query} slug={slug} />
      <OpenNewBarcode listPath={workspaceHref(slug, "/barcodes")} />
    </>
  );
}
