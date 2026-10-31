"use client";

import { Separator } from "@repo/design-system/components/ui/separator";
import { cn } from "@repo/design-system/lib/utils";
import { Globe, Palette, QrCode, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrgSwitcher } from "@/components/org-switcher";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Codes",
    icon: QrCode,
    // Code detail pages live under /dashboard/codes/<id>.
    match: (pathname: string) =>
      pathname === "/dashboard" || pathname.startsWith("/dashboard/codes"),
  },
  { href: "/dashboard/brand-kits", label: "Brand kits", icon: Palette },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/domains", label: "Domains", icon: Globe },
];

const linkClass =
  "hover:bg-muted flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors";

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 md:w-56">
      <OrgSwitcher className="mb-2" />
      <nav
        aria-label="Dashboard"
        className="flex gap-1 overflow-x-auto md:flex-col"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = item.match
            ? item.match(pathname)
            : pathname.startsWith(item.href);
          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(linkClass, isActive && "bg-muted")}
              href={item.href}
              key={item.href}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
        <Separator className="my-2 hidden md:block" />
        <Link className={linkClass} href="/settings/general">
          <Settings className="size-4" />
          Settings
        </Link>
      </nav>
    </aside>
  );
}
