import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { Barcode } from "iconsax-reactjs";
import { getUserSettings } from "@/actions/user-settings";
import { ListPagination } from "@/app/(app)/dashboard/_components/list-pagination";
import {
  GRID_PAGE_SIZES,
  pageSizeMenu,
} from "@/app/(app)/dashboard/_lib/list-paging";
import { formatNumber } from "@/app/(app)/dashboard/codes/_components/format";
import { listFolders } from "@/app/(app)/dashboard/codes/_lib/organize";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { BARCODE_FORMATS } from "@/lib/barcode/formats";
import {
  countBarcodeTrash,
  getBarcodeUsage,
  listBarcodes,
} from "@/lib/barcodes/service";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { loadPage } from "@/lib/paging";
import { can } from "@/lib/permissions";
import { PLAN_NAMES } from "@/lib/pricing";
import { workspaceHref } from "@/lib/workspace-paths";
import { toBarcodeCard } from "../_lib/cards";
import {
  barcodesHref,
  folderOptions,
  isUnfiltered,
  parseBarcodesFilters,
} from "../_lib/filters";
import { BarcodesHeader } from "./barcodes-header";
import { BarcodesList } from "./barcodes-list";
import { BarcodesToolbar } from "./barcodes-toolbar";
import { NewBarcodeButton } from "./new-barcode-button";

/**
 * Saved barcodes: static EAN, UPC, Code 128, Data Matrix and other barcodes
 * kept to edit and download again. Filters live in the URL; a card opens
 * the editor at /dashboard/<workspace>/barcodes/<id>, and New barcode the
 * modal. /barcodes and /barcodes/new both render it.
 */
export async function BarcodesListView({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const t = await getAppTranslations("app.dashboard.barcodes.page");
  const tp = await getAppTranslations("app.dashboard.paging");
  const scope = await requireDashboardScope();
  const basePath = workspaceHref(slug, "/barcodes");
  const filters = parseBarcodesFilters(searchParams);

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
  const pageSize = effective.size;
  // Past the last page (an old link, barcodes deleted since): the last page.
  const { barcodes, total, page } = await loadPage(
    effective.page,
    (page) =>
      listBarcodes(scope, {
        status: effective.status,
        q: effective.q || undefined,
        format: effective.format ?? undefined,
        folderId: effective.folder ?? undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
    pageSize,
  );
  const folderNames = new Map(folders.map((row) => [row.id, row.name]));
  const cards = barcodes.map((view) => toBarcodeCard(scope, view, folderNames));
  const canWrite = can(scope.role, "content.write");
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const brandNew =
    usage.used === 0 && trashCount === 0 && effective.status === "active";
  const href = (patch: Partial<typeof effective>) =>
    barcodesHref(basePath, { ...effective, page }, patch);

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
          ? t("usedSaved", { used: formatNumber(usage.used) })
          : t("usedOfLimitSaved", {
              used: formatNumber(usage.used),
              limit: formatNumber(usage.limit),
            })}
        {" · "}
        {t("planBarcodesAreStaticThey", { plan: PLAN_NAMES[usage.plan] })}
      </p>

      {brandNew ? (
        <Empty className="border">
          <EmptyHeader>
            <span className="bg-muted/50 text-muted-foreground mx-auto mb-2 grid size-12 place-items-center rounded-full border">
              <Barcode aria-hidden className="size-6" />
            </span>
            <EmptyTitle>{t("noBarcodesYet")}</EmptyTitle>
            <EmptyDescription>
              {canWrite
                ? t("saveLengthKindsOfBarcode", {
                    length: BARCODE_FORMATS.length,
                  })
                : t("whenSomeoneInThisWorkspace")}
            </EmptyDescription>
          </EmptyHeader>
          {canWrite && (
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-2">
                <NewBarcodeButton />
                <Button asChild variant="outline">
                  <Link href="/barcode-generator">
                    {t("openTheFreeGenerator")}
                  </Link>
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
              {t("barcodesInTheTrashDont")}
            </p>
          )}
          {cards.length === 0 ? (
            <div className="text-muted-foreground space-y-2 rounded-xl border py-10 text-center text-sm">
              <p>
                {effective.status === "trash"
                  ? t("theTrashIsEmpty")
                  : effective.q
                    ? t("noBarcodesMatchQ", { q: effective.q })
                    : isUnfiltered(effective)
                      ? t("noBarcodesHereYet")
                      : t("noBarcodesMatchTheseFilters")}
              </p>
              {!isUnfiltered(effective) && (
                <Link className="underline" href={basePath}>
                  {t("showAllBarcodes")}
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
          <ListPagination
            labels={{
              navigation: tp("navigation"),
              previous: t("previous"),
              next: t("next"),
              pageSize: tp("rowsPerPage"),
            }}
            nextHref={page < pageCount ? href({ page: page + 1 }) : null}
            previousHref={page > 1 ? href({ page: page - 1 }) : null}
            sizes={pageSizeMenu({
              options: GRID_PAGE_SIZES,
              value: pageSize,
              total,
              label: (count) => tp("perPage", { count }),
              href: (size) => href({ size }),
            })}
            summary={t("pagePageOfPagecountTotal", {
              page,
              pageCount,
              total: formatNumber(total),
            })}
          />
        </div>
      )}
    </div>
  );
}
