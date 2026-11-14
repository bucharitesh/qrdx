import { Bot } from "@repo/design-system/components/icons";
import { isConsolePath } from "@repo/next-config/console-zone";
import {
  People as Community,
  Card as CreditCard,
  TrendUp as Growth,
  Health as HeartPulse,
  type Icon,
  Element3 as LayoutDashboard,
  ColorSwatch as Palette,
  MoneySend as Payouts,
  Electricity as Plug,
  ScanBarcode as QrCode,
  DocumentText as ScrollText,
  ShieldCross as ShieldAlert,
  StatusUp as TrendingUp,
  Profile2User as Users,
} from "iconsax-reactjs";

// The admin menu, for this app's nav and the back-office console's, so both
// zones show the same one. Pure and client-safe.

/**
 * Which app has the page: "core" pages are in this app, on every
 * deployment; "console" pages only exist in the console, so they're listed
 * only where it's on (CONSOLE_ORIGIN set).
 */
export type AdminZone = "core" | "console";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: Icon;
  zone: AdminZone;
}

// The console's five sections stay "core" while this app still has its own
// copies of them; they become "console" when those copies are removed.
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, zone: "core" },
  { href: "/admin/growth", label: "Growth", icon: Growth, zone: "core" },
  { href: "/admin/users", label: "Users", icon: Users, zone: "core" },
  { href: "/admin/themes", label: "Themes", icon: Palette, zone: "core" },
  {
    href: "/admin/community",
    label: "Community",
    icon: Community,
    zone: "core",
  },
  { href: "/admin/codes", label: "QR Codes", icon: QrCode, zone: "core" },
  { href: "/admin/abuse", label: "Abuse", icon: ShieldAlert, zone: "core" },
  { href: "/admin/ai-usage", label: "AI Usage", icon: Bot, zone: "core" },
  {
    href: "/admin/subscriptions",
    label: "Subscriptions",
    icon: CreditCard,
    zone: "core",
  },
  {
    href: "/admin/numbers",
    label: "Home numbers",
    icon: TrendingUp,
    zone: "core",
  },
  {
    href: "/admin/affiliates",
    label: "Affiliates",
    icon: Payouts,
    zone: "core",
  },
  {
    href: "/admin/integrations",
    label: "Integrations",
    icon: Plug,
    zone: "core",
  },
  {
    href: "/admin/audit-log",
    label: "Audit Log",
    icon: ScrollText,
    zone: "core",
  },
  { href: "/admin/health", label: "Health", icon: HeartPulse, zone: "core" },
];

export interface AdminNavLink extends AdminNavItem {
  /**
   * Served by the other zone: a plain <a> (a full page load), since
   * next/link can't navigate between zones.
   */
  crossZone: boolean;
}

/**
 * The menu as this app shows it. With the console on, its sections are
 * served there whichever app has a copy, so their links load a new page.
 */
export function adminNavLinks(consoleEnabled: boolean): AdminNavLink[] {
  return ADMIN_NAV_ITEMS.filter(
    (item) => item.zone === "core" || consoleEnabled,
  ).map((item) => ({
    ...item,
    crossZone: consoleEnabled && isConsolePath(item.href),
  }));
}
