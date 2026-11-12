"use client";
import { useTranslations } from "next-intl";

// The Barcodes page's header: the folder switcher as its title (the codes'
// folders), the count, and New barcode.

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Add,
  ArrowDown2,
  Category,
  Folder2,
  FolderMinus,
} from "iconsax-reactjs";
import Link from "next/link";
import { formatNumber } from "@/app/(app)/dashboard/codes/_components/format";
import { useCan } from "@/components/workspace-provider";
import {
  type BarcodesFilters,
  barcodesHref,
  type FolderOption,
} from "../_lib/filters";

export function BarcodesHeader({
  basePath,
  filters,
  folders,
  total,
}: {
  basePath: string;
  filters: BarcodesFilters;
  folders: FolderOption[];
  /** Barcodes matching the filters */
  total: number;
}) {
  const t = useTranslations("app.dashboard.barcodes.barcodesHeader");
  const canWrite = useCan("content.write");
  const current = folders.find((row) => row.id === filters.folder) ?? null;
  const title = current
    ? current.name
    : filters.folder === "none"
      ? "Not in a folder"
      : filters.status === "trash"
        ? "Trash"
        : "All barcodes";
  const to = (folder: string | null) =>
    barcodesHref(basePath, filters, { folder });

  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <h1 className="-ml-2 min-w-0 text-2xl font-semibold tracking-tight">
          <span className="sr-only">{t("barcodes")} </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="hover:bg-muted/60 focus-visible:ring-ring/50 inline-flex max-w-full items-center gap-2 rounded-lg px-2 py-1 outline-none transition-colors focus-visible:ring-[3px]"
                type="button"
              >
                {current ? (
                  <Folder2 aria-hidden className="size-5 shrink-0" />
                ) : (
                  <Category aria-hidden className="size-5 shrink-0" />
                )}
                <span className="truncate">{title}</span>
                <ArrowDown2
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0"
                />
                <span className="sr-only">{t("changeFolder")}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-[min(28rem,70vh)] w-64 overflow-y-auto"
            >
              <DropdownMenuItem asChild>
                <Link href={to(null)}>
                  <Category aria-hidden />
                  {t("allBarcodes")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={to("none")}>
                  <FolderMinus aria-hidden />
                  {t("notInAFolder")}
                </Link>
              </DropdownMenuItem>
              {folders.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                    {t("foldersSharedWithCodes")}
                  </DropdownMenuLabel>
                  {folders.map((folder) => (
                    <DropdownMenuItem asChild key={folder.id}>
                      <Link
                        href={to(folder.id)}
                        style={{
                          paddingLeft: `${0.5 + folder.depth * 0.75}rem`,
                        }}
                      >
                        <Folder2 aria-hidden />
                        <span className="truncate">{folder.name}</span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </h1>
        <span className="text-muted-foreground hidden shrink-0 text-sm tabular-nums sm:inline">
          {formatNumber(total)} {total === 1 ? t("barcode") : t("barcodes2")}
        </span>
      </div>
      {canWrite && (
        <Button asChild>
          <Link href={`${basePath}/new`}>
            <Add aria-hidden />
            <span className="max-sm:hidden">{t("newBarcode")}</span>
            <span className="sm:hidden">{t("new")}</span>
          </Link>
        </Button>
      )}
    </div>
  );
}
