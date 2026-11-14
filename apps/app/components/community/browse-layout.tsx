"use client";

// One layout for every community gallery: the sidebar on the left (a sheet
// behind "Filters" below lg), the toolbar, then the grid. It runs from rail
// to rail of the site's frame, with no extra side margin.
import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import { cn } from "@repo/design-system/lib/utils";
import { Filter } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

export function BrowseLayout({
  sidebar,
  toolbar,
  aside,
  activeFilters = 0,
  sheetTitle,
  children,
}: {
  /** The sidebar's rows */
  sidebar: ReactNode;
  /** Left of the toolbar, after "Filters" (the sort menu) */
  toolbar?: ReactNode;
  /** Right of the toolbar ("How to publish") */
  aside?: ReactNode;
  /** Filters in use besides the default, for the badge on "Filters" */
  activeFilters?: number;
  sheetTitle: string;
  children: ReactNode;
}) {
  const t = useTranslations("community.browseLayout");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[60vh] w-full">
      <aside className="hidden w-60 shrink-0 border-r lg:block">
        <nav aria-label={t("filters")} className="space-y-1 p-3">
          {sidebar}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-6 px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sheet onOpenChange={setOpen} open={open}>
              <SheetTrigger asChild>
                <Button
                  className={cn(
                    "gap-1.5 lg:hidden",
                    activeFilters > 0 && "border-foreground/30",
                  )}
                  size="sm"
                  variant="outline"
                >
                  <Filter aria-hidden className="size-3.5" />
                  {t("filters")}
                  {activeFilters > 0 && (
                    <span className="bg-foreground text-background flex size-4 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums">
                      {activeFilters}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-72 p-0" side="left">
                <SheetHeader className="border-b px-6 py-4">
                  <SheetTitle>{sheetTitle}</SheetTitle>
                </SheetHeader>
                {/* Choosing a filter closes the sheet, so the results show. */}
                <nav
                  aria-label={t("filters")}
                  className="space-y-1 overflow-y-auto p-4"
                  onClickCapture={(event) => {
                    if ((event.target as Element).closest("a, button")) {
                      setOpen(false);
                    }
                  }}
                >
                  {sidebar}
                </nav>
              </SheetContent>
            </Sheet>
            {toolbar}
          </div>
          {aside}
        </div>
        {children}
      </div>
    </div>
  );
}
