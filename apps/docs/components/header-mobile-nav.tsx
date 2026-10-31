"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icons } from "@/components/icons";
import { headerNavEntries } from "./header-nav";

const linkClass =
  "flex items-center gap-1 py-1.5 text-sm text-secondary-foreground/70 hover:text-secondary-foreground transition-colors";

/** Every header destination, grouped like the desktop dropdowns. */
export function HeaderMobileNavList({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname() ?? "/";
  const groups = headerNavEntries.filter((entry) => entry.items);
  const singles = headerNavEntries.filter((entry) => !entry.items);

  return (
    <nav
      aria-label="Main"
      className={cn("flex flex-col gap-5 overflow-y-auto", className)}
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.name}
            </p>
            <ul>
              {group.items?.map((item) => {
                const external = "external" in item && Boolean(item.external);
                const current = !external && pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        linkClass,
                        current && "font-medium text-secondary-foreground",
                      )}
                      {...(external && {
                        target: "_blank",
                        rel: "noopener noreferrer",
                      })}
                    >
                      {item.name}
                      {external && (
                        <ArrowUpRight aria-hidden className="size-3.5" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <ul className="flex flex-wrap gap-2 border-t border-border pt-4">
        {singles.map((entry) => {
          const current = pathname === entry.href;
          return (
            <li key={entry.id}>
              <Link
                href={entry.href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border border-border px-3 text-sm font-medium text-secondary-foreground/80 hover:text-secondary-foreground transition-colors",
                  current && "bg-secondary/60 text-secondary-foreground",
                )}
              >
                {entry.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Menu button + sheet for headers that have no drawer of their own. */
export function HeaderMobileMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8 lg:hidden", className)}
          aria-label="Open menu"
        >
          <Icons.Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-80 gap-6 p-6"
        aria-describedby={undefined}
      >
        <SheetTitle className="text-base">Menu</SheetTitle>
        <HeaderMobileNavList onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
