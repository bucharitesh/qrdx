"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import { cn } from "@repo/design-system/lib/utils";
import { ExportSquare, HamburgerMenu } from "iconsax-reactjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { headerNavEntries } from "./header-nav";

/**
 * Every header destination, grouped like the desktop dropdowns. No
 * prefetching: opening the menu would fetch every destination at once.
 */
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
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1.5">
          <p className="px-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {group.name}
          </p>
          <ul className="grid grid-cols-2 gap-1 [&>li:last-child:nth-child(odd)]:col-span-2">
            {group.items?.map((item) => {
              const external = Boolean(item.external);
              const current = !external && pathname === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href} className="min-w-0">
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={current ? "page" : undefined}
                    prefetch={false}
                    className={cn(
                      "group/nav-item flex min-h-11 items-center gap-2.5 rounded-lg p-1.5 text-sm leading-tight text-foreground/80 transition-colors hover:bg-accent/70 hover:text-foreground active:bg-accent",
                      current && "bg-accent/60 font-medium text-foreground",
                    )}
                    {...(external && {
                      target: "_blank",
                      rel: "noopener noreferrer",
                    })}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-muted/40 transition-colors group-hover/nav-item:bg-background">
                      <Icon aria-hidden className="size-4 text-foreground/80" />
                    </span>
                    <span className="min-w-0 text-pretty">
                      {item.name}
                      {external && (
                        <ExportSquare
                          aria-hidden
                          className="ml-1 inline size-3 align-[-1px] text-muted-foreground"
                        />
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <ul className="flex flex-wrap gap-2 border-t border-border pt-4">
        {singles.map((entry) => {
          const current = pathname === entry.href;
          return (
            <li key={entry.id}>
              <Link
                href={entry.href}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                prefetch={false}
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
          <HamburgerMenu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[22rem] max-w-[90vw] gap-5 p-5 sm:max-w-[22rem]"
        aria-describedby={undefined}
      >
        <SheetTitle className="text-base">Menu</SheetTitle>
        <HeaderMobileNavList onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
