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
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AppSidebar } from "./app-sidebar";
import { findActiveNavItem } from "./nav-config";

/** Below md the sidebar lives in a sheet opened from the top of the content. */
export function MobileNav() {
  const pathname = usePathname();
  // Tied to the path it was opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const current = findActiveNavItem(pathname);

  return (
    <div className="mb-4 flex items-center gap-3 md:hidden">
      <Sheet
        onOpenChange={(open) => setOpenOn(open ? pathname : null)}
        open={openOn === pathname}
      >
        <SheetTrigger asChild>
          <Button size="sm" variant="outline">
            <Menu aria-hidden />
            Menu
          </Button>
        </SheetTrigger>
        <SheetContent
          className="w-72 gap-0 overflow-y-auto p-4 pt-12"
          side="left"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Workspace and account pages</SheetDescription>
          </SheetHeader>
          <AppSidebar onNavigate={() => setOpenOn(null)} />
        </SheetContent>
      </Sheet>
      {current && (
        <span className="text-muted-foreground truncate text-sm font-medium">
          {current.label}
        </span>
      )}
    </div>
  );
}
