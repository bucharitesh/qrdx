"use client";

import { Separator } from "@repo/design-system/components/ui/separator";
import { cn } from "@repo/design-system/lib/utils";
import {
  ChartNoAxesCombined,
  ExternalLink,
  type LucideIcon,
  Palette,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem =
  | {
      type: "link";
      href: string;
      label: string;
      icon?: LucideIcon;
      isExternal?: boolean;
    }
  | {
      type: "separator";
      id: string;
    };

const BASE_NAV_ITEMS: NavItem[] = [
  {
    type: "link",
    href: "/settings/qr-themes",
    label: "QR Code Themes",
    icon: Palette,
  },
  {
    type: "link",
    href: "/settings/usage",
    label: "AI Usage",
    icon: ChartNoAxesCombined,
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  const navItems = [...BASE_NAV_ITEMS];

  return (
    <aside className="w-64 shrink-0">
      <nav className="space-y-1">
        {navItems.map((item) => {
          if (item.type === "separator") {
            return <Separator key={item.id} className="my-2" />;
          }

          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "hover:bg-muted flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive && "bg-muted",
              )}
            >
              {item.icon && <item.icon className="size-4" />}
              {item.label}
              {item.isExternal && <ExternalLink className="ml-auto size-4" />}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
