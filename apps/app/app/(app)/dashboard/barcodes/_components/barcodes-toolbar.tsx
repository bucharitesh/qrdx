"use client";
import { useTranslations } from "next-intl";

// The Barcodes list's toolbar: Filter by format, Trash, and live search,
// like the codes and pages lists. Filters live in the URL.

import { Close as X } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Filter, Trash } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ListSearch } from "@/app/(app)/dashboard/codes/_components/display-menu";
import { formatNumber } from "@/app/(app)/dashboard/codes/_components/format";
import {
  BARCODE_FORMATS,
  getBarcodeFormat,
  isBarcodeFormatId,
} from "@/lib/barcode/formats";
import { type BarcodesFilters, barcodesHref } from "../_lib/filters";

export function BarcodesToolbar({
  basePath,
  filters,
  trashCount,
}: {
  basePath: string;
  filters: BarcodesFilters;
  trashCount: number;
}) {
  const t = useTranslations("app.dashboard.barcodes.barcodesToolbar");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const go = (patch: Partial<BarcodesFilters>, replace = false) =>
    startTransition(() => {
      const href = barcodesHref(basePath, filters, patch);
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  const inTrash = filters.status === "trash";

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Filter aria-hidden />
                {t("filter")}
                {filters.format && (
                  <span className="bg-foreground text-background rounded-full px-1.5 text-[11px] leading-4 font-medium">
                    1
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                {t("barcodeType")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                onValueChange={(value) =>
                  go({ format: isBarcodeFormatId(value) ? value : null })
                }
                value={filters.format ?? "any"}
              >
                <DropdownMenuRadioItem value="any">
                  {t("everyType")}
                </DropdownMenuRadioItem>
                {BARCODE_FORMATS.map((format) => (
                  <DropdownMenuRadioItem key={format.id} value={format.id}>
                    {format.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            aria-pressed={inTrash}
            onClick={() => go({ status: inTrash ? "active" : "trash" })}
            variant={inTrash ? "secondary" : "outline"}
          >
            <Trash aria-hidden />
            {t("trash")}
            {trashCount > 0 && (
              <span className="text-muted-foreground tabular-nums">
                {formatNumber(trashCount)}
              </span>
            )}
          </Button>
        </div>
        <ListSearch
          className="flex-1 sm:ml-auto sm:max-w-sm"
          label={t("searchBarcodes")}
          onSearch={(q) => go({ q }, true)}
          placeholder={t("searchTitlesAndValues")}
          value={filters.q}
        />
      </div>
      {filters.format && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            className="h-7 rounded-full"
            onClick={() => go({ format: null })}
            size="sm"
            variant="secondary"
          >
            {getBarcodeFormat(filters.format).label}
            <X aria-hidden />
            <span className="sr-only">{t("removeFilter")}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
