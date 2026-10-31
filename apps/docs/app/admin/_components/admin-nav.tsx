"use client";

import { cn } from "@repo/design-system/lib/utils";
import {
  ChartNoAxesCombined,
  CreditCard,
  LayoutDashboard,
  Palette,
  Plug,
  QrCode,
  ScrollText,
  ShieldAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/themes", label: "Themes", icon: Palette },
  { href: "/admin/codes", label: "QR Codes", icon: QrCode },
  { href: "/admin/abuse", label: "Abuse", icon: ShieldAlert },
  { href: "/admin/ai-usage", label: "AI Usage", icon: ChartNoAxesCombined },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/integrations", label: "Integrations", icon: Plug },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <aside className="w-full shrink-0 md:w-56">
      <nav className="flex gap-1 overflow-x-auto md:flex-col">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "hover:bg-muted flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                isActive && "bg-muted",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
