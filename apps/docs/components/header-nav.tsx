"use client";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@repo/design-system/components/ui/navigation-menu";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { siteConfig } from "@/config/site";

export type HeaderNavEntry = (typeof siteConfig.nav.links)[number];
export type HeaderNavItem = NonNullable<HeaderNavEntry["items"]>[number];

export const headerNavEntries: HeaderNavEntry[] = siteConfig.nav.links;

const isExternal = (item: HeaderNavItem) =>
  "external" in item && Boolean(item.external);

/** True when `pathname` is `href` or a page below it. */
export function matchesPath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The top-level entry the current page belongs to, if any. */
export function getActiveEntryId(pathname: string): number | undefined {
  const direct = headerNavEntries.find(
    (entry) => !entry.items && matchesPath(pathname, entry.href),
  );
  if (direct) return direct.id;
  return headerNavEntries.find((entry) =>
    entry.items?.some(
      (item) => !isExternal(item) && matchesPath(pathname, item.href),
    ),
  )?.id;
}

const topLevelClass =
  "h-9 rounded-full bg-transparent px-3 text-sm font-medium tracking-tight text-secondary-foreground/60 hover:bg-secondary/60 hover:text-secondary-foreground focus:bg-secondary/60 focus:text-secondary-foreground data-[state=open]:bg-secondary/60 data-[state=open]:text-secondary-foreground data-[state=open]:hover:bg-secondary/60 data-[state=open]:focus:bg-secondary/60";
const activeClass = "bg-secondary/60 text-secondary-foreground";

export function HeaderNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  const activeId = getActiveEntryId(pathname);

  return (
    <NavigationMenu
      viewport={false}
      aria-label="Main"
      className={cn("hidden lg:flex", className)}
    >
      <NavigationMenuList className="gap-0.5">
        {headerNavEntries.map((entry) => {
          const active = entry.id === activeId;

          if (!entry.items) {
            return (
              <NavigationMenuItem key={entry.id}>
                <NavigationMenuLink
                  asChild
                  active={active}
                  className={cn(
                    "inline-flex flex-row items-center justify-center",
                    topLevelClass,
                    active && activeClass,
                  )}
                >
                  <Link
                    href={entry.href}
                    aria-current={active ? "page" : undefined}
                  >
                    {entry.name}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            );
          }

          return (
            <NavigationMenuItem key={entry.id}>
              <NavigationMenuTrigger
                className={cn(topLevelClass, active && activeClass)}
              >
                {entry.name}
              </NavigationMenuTrigger>
              <NavigationMenuContent className="z-50">
                <ul className="grid w-80 gap-0.5">
                  {entry.items.map((item) => {
                    const external = isExternal(item);
                    const current = !external && pathname === item.href;
                    return (
                      <li key={item.href}>
                        <NavigationMenuLink asChild active={current}>
                          <Link
                            href={item.href}
                            aria-current={current ? "page" : undefined}
                            {...(external && {
                              target: "_blank",
                              rel: "noopener noreferrer",
                            })}
                          >
                            <span className="flex items-center gap-1 font-medium text-secondary-foreground">
                              {item.name}
                              {external && (
                                <ArrowUpRight
                                  aria-hidden
                                  className="size-3.5"
                                />
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground leading-snug">
                              {item.description}
                            </span>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                    );
                  })}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
