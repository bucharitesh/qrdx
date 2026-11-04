"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import { HamburgerMenu as Menu } from "iconsax-reactjs";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import type { Meter } from "@/app/settings/usage/_lib/meters";
import { AppSidebar } from "./app-sidebar";
import type { ShellData } from "./shell-data";

/**
 * Below md the sidebar, workspace switcher included, lives in a sheet, with
 * the same areas and the same slide between them.
 */
export function MobileNav({
  shell,
  limitWarnings = null,
}: {
  shell: ShellData | null;
  limitWarnings?: Promise<Meter[]> | null;
}) {
  const pathname = usePathname();
  // Tied to the paths it may show: the one it was opened on, plus an area
  // opened from it (it stays open to show that area slide in). Any other
  // navigation closes it.
  const [openOn, setOpenOn] = useState<string[] | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <Sheet
      onOpenChange={(open) => setOpenOn(open ? [pathname] : null)}
      open={openOn?.includes(pathname) ?? false}
    >
      <SheetTrigger asChild>
        <Button
          aria-label="Open navigation"
          className="size-8 md:hidden"
          size="icon"
          variant="ghost"
        >
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-72 gap-0 p-0 pt-10"
        // Start in the open area: the others are inert, so the default
        // (first tabbable in the sheet) would skip past the whole nav.
        onOpenAutoFocus={(event) => {
          const first = bodyRef.current
            ?.querySelector("[data-area-panel]:not([inert])")
            ?.querySelector<HTMLElement>("a[href], button");
          if (!first) return;
          event.preventDefault();
          first.focus();
        }}
        side="left"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Dashboard and settings pages</SheetDescription>
        </SheetHeader>
        <div className="contents" ref={bodyRef}>
          <AppSidebar
            limitWarnings={limitWarnings}
            onAreaNavigate={(href) => setOpenOn([pathname, href])}
            onNavigate={() => setOpenOn(null)}
            shell={shell}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
