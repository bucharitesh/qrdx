"use client";

import { authClient } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { Separator } from "@repo/design-system/components/ui/separator";
import { cn } from "@repo/design-system/lib/utils";
import { BookOpen, ShieldCheck, SquareTerminal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { OrgSwitcher } from "@/components/org-switcher";
import { APP_NAV, hasAdminRole, isNavItemActive } from "./nav-config";

const linkClass =
  "hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px]";

/** Sidebar contents shared by the desktop rail and the mobile sheet. */
export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  // Rendered twice (rail + sheet), so label ids must be unique per instance.
  const idPrefix = useId();

  return (
    <div className="flex flex-col gap-6">
      {/* Reserves the switcher's height while the session loads. */}
      <div className="min-h-9">
        <OrgSwitcher />
      </div>

      <nav aria-label="Dashboard" className="flex flex-col gap-6">
        {APP_NAV.map((group) => {
          const labelId = `${idPrefix}-${group.id}`;
          return (
            <div className="flex flex-col gap-1" key={group.id}>
              <div
                className="text-muted-foreground px-3 text-xs font-medium"
                id={labelId}
              >
                {group.label}
              </div>
              <ul aria-labelledby={labelId} className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive = isNavItemActive(item, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          linkClass,
                          isActive
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground",
                        )}
                        href={item.href}
                        onClick={onNavigate}
                      >
                        <item.icon aria-hidden className="size-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <Separator />

      <div className="flex flex-col gap-1">
        <Button asChild className="mb-1 w-full justify-start" variant="outline">
          <Link href="/playground" onClick={onNavigate}>
            <SquareTerminal aria-hidden />
            Open playground
          </Link>
        </Button>
        <Link
          className={cn(linkClass, "text-muted-foreground")}
          href="/docs"
          onClick={onNavigate}
        >
          <BookOpen aria-hidden className="size-4 shrink-0" />
          Docs
        </Link>
        {hasAdminRole(session?.user.role) && (
          <Link
            className={cn(linkClass, "text-muted-foreground")}
            href="/admin"
            onClick={onNavigate}
          >
            <ShieldCheck aria-hidden className="size-4 shrink-0" />
            Admin
          </Link>
        )}
      </div>
    </div>
  );
}
