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
import { useState } from "react";
import type { Meter } from "@/app/settings/usage/_lib/meters";
import { AppSidebar } from "./app-sidebar";
import type { ShellData } from "./shell-data";

/** Below md the sidebar, workspace switcher included, lives in a sheet. */
export function MobileNav({
  shell,
  limitWarnings = null,
}: {
  shell: ShellData | null;
  limitWarnings?: Promise<Meter[]> | null;
}) {
  const pathname = usePathname();
  // Tied to the path it was opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);

  return (
    <Sheet
      onOpenChange={(open) => setOpenOn(open ? pathname : null)}
      open={openOn === pathname}
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
      <SheetContent className="w-72 gap-0 p-0 pt-10" side="left">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Dashboard and settings pages</SheetDescription>
        </SheetHeader>
        <AppSidebar
          limitWarnings={limitWarnings}
          onNavigate={() => setOpenOn(null)}
          shell={shell}
        />
      </SheetContent>
    </Sheet>
  );
}
