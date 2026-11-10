import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Add, Barcode } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { getUserSettings } from "@/actions/user-settings";
import { BarcodesHeader } from "@/app/dashboard/barcodes/_components/barcodes-header";
import { BarcodesList } from "@/app/dashboard/barcodes/_components/barcodes-list";
import { BarcodesToolbar } from "@/app/dashboard/barcodes/_components/barcodes-toolbar";
import {
  folderOptions,
  toBarcodeCard,
} from "@/app/dashboard/barcodes/_lib/cards";
import {
  barcodesHref,
  isUnfiltered,
  parseBarcodesFilters,
} from "@/app/dashboard/barcodes/_lib/filters";
import { formatNumber } from "@/app/dashboard/codes/_components/format";
import { listFolders } from "@/app/dashboard/codes/_lib/organize";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { BARCODE_FORMATS } from "@/lib/barcode/formats";
import {
  countBarcodeTrash,
  getBarcodeUsage,
  listBarcodes,
} from "@/lib/barcodes/service";
import { can } from "@/lib/permissions";
import { PLAN_NAMES } from "@/lib/pricing";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "Barcodes",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 24;

/**
 * Saved barcodes: static EAN, UPC, Code 128, Data Matrix and other barcodes
 * kept to edit and download again. Filters live in the URL; a card opens
 * the editor at /dashboard/<workspace>/barcodes/<id>.
 */
export default async function BarcodesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ workspace: slug }, scope] = await Promise.all([
    params,
    requireDashboardScope(),
  ]);
  const basePath = workspaceHref(slug, "/barcodes");
  const filters = parseBarcodesFilters(await searchParams);

  const [usage, folderRows, trashCount, settings] = await Promise.all([
    getBarcodeUsage(scope),
    listFolders(scope),
    countBarcodeTrash(scope),
    getUserSettings().catch(() => null),
  ]);
  const folders = folderOptions(folderRows);
  // Ids from old links (a deleted folder) are dropped, not errors.
  const effective = {
    ...filters,
    folder:
      filters.folder === "none" ||
      folders.some((row) => row.id === filters.folder)
        ? filters.folder
        : null,
  };
  const { barcodes, total } = await listBarcodes(scope, {
    status: effective.status,
    q: effective.q || undefined,
    format: effective.format ?? undefined,
    folderId: effective.folder ?? undefined,
    limit: PAGE_SIZE,
    offset: (effective.page - 1) * PAGE_SIZE,
  });
  const folderNames = new Map(folders.map((row) => [row.id, row.name]));
  const cards = barcodes.map((view) => toBarcodeCard(scope, view, folderNames));
  const canWrite = can(scope.role, "content.write");
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(effective.page, pageCount);
  const brandNew =
    usage.used === 0 && trashCount === 0 && effective.status === "active";
  const href = (patch: Partial<typeof effective>) =>
    barcodesHref(basePath, effective, patch);

  return (
    <div className="space-y-5">
      <BarcodesHeader
        basePath={basePath}
        filters={effective}
        folders={folders}
        total={total}
      />
      <p className="text-muted-foreground text-sm">
        {usage.limit === null
          ? `${formatNumber(usage.used)} saved`
          : `${formatNumber(usage.used)} of ${formatNumber(usage.limit)} saved`}{" "}
        · {PLAN_NAMES[usage.plan]} plan. Barcodes are static: they never expire
        and work on every plan.
      </p>

      {brandNew ? (
        <Empty className="border">
          <EmptyHeader>
            <span className="bg-muted/50 text-muted-foreground mx-auto mb-2 grid size-12 place-items-center rounded-full border">
              <Barcode aria-hidden className="size-6" />
            </span>
            <EmptyTitle>No barcodes yet</EmptyTitle>
            <EmptyDescription>
              {canWrite
                ? `Save ${BARCODE_FORMATS.length} kinds of barcode here, from EAN-13 and UPC-A to Code 128 and Data Matrix, to edit and download again. The bars hold the data, so nothing expires.`
                : "When someone in this workspace saves one, it shows up here."}
            </EmptyDescription>
          </EmptyHeader>
          {canWrite && (
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href={`${basePath}/new`}>
                    <Add aria-hidden />
                    New barcode
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/barcode-generator">Open the free generator</Link>
                </Button>
              </div>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="space-y-4">
          <BarcodesToolbar
            basePath={basePath}
            filters={effective}
            trashCount={trashCount}
          />
          {effective.status === "trash" && (
            <p className="text-muted-foreground text-xs">
              Barcodes in the trash don't count toward your plan. Restore them,
              or delete them for good.
            </p>
          )}
          {cards.length === 0 ? (
            <div className="text-muted-foreground space-y-2 rounded-xl border py-10 text-center text-sm">
              <p>
                {effective.status === "trash"
                  ? "The trash is empty."
                  : effective.q
                    ? `No barcodes match "${effective.q}".`
                    : isUnfiltered(effective)
                      ? "No barcodes here yet."
                      : "No barcodes match these filters."}
              </p>
              {!isUnfiltered(effective) && (
                <Link className="underline" href={basePath}>
                  Show all barcodes
                </Link>
              )}
            </div>
          ) : (
            <BarcodesList
              basePath={basePath}
              cards={cards}
              folders={folders}
              keyboardShortcuts={settings?.keyboardShortcuts ?? true}
              status={effective.status}
            />
          )}
          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Page {page} of {pageCount} · {formatNumber(total)} barcodes
              </span>
              <div className="flex gap-2">
                <Button
                  asChild={page > 1}
                  disabled={page <= 1}
                  size="sm"
                  variant="outline"
                >
                  {page > 1 ? (
                    <Link href={href({ page: page - 1 })}>Previous</Link>
                  ) : (
                    "Previous"
                  )}
                </Button>
                <Button
                  asChild={page < pageCount}
                  disabled={page >= pageCount}
                  size="sm"
                  variant="outline"
                >
                  {page < pageCount ? (
                    <Link href={href({ page: page + 1 })}>Next</Link>
                  ) : (
                    "Next"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
