import {
  Notification as Bell,
  Chart as ChartNoAxesColumn,
  ProfileCircle as CircleUser,
  FolderOpen,
  Speedometer as Gauge,
  Global as Globe,
  type Icon as LucideIcon,
  Element2 as PanelsTopLeft,
  Electricity as Plug,
  ScanBarcode as QrCode,
  Setting4 as SlidersHorizontal,
  ColorsSquare as SwatchBook,
  Profile2User as Users,
  Share as Webhook,
} from "iconsax-reactjs";

export interface AppNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Overrides the default "href or anything below it" active rule. */
  match?: (pathname: string) => boolean;
}

export interface AppNavGroup {
  id: string;
  label: string;
  items: AppNavItem[];
}

const isAtOrBelow = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export const APP_NAV: AppNavGroup[] = [
  {
    // Scoped to the workspace picked in the team switcher.
    id: "workspace",
    label: "Workspace",
    items: [
      {
        href: "/dashboard",
        label: "Codes",
        icon: QrCode,
        // Code detail pages live under /dashboard/codes/<id>.
        match: (pathname) =>
          pathname === "/dashboard" ||
          isAtOrBelow(pathname, "/dashboard/codes"),
      },
      { href: "/dashboard/pages", label: "Pages", icon: PanelsTopLeft },
      { href: "/dashboard/files", label: "Files", icon: FolderOpen },
      {
        href: "/dashboard/analytics",
        label: "Analytics",
        icon: ChartNoAxesColumn,
      },
      { href: "/dashboard/themes", label: "Themes", icon: SwatchBook },
      { href: "/dashboard/domains", label: "Domains", icon: Globe },
      { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/dashboard/team", label: "Team", icon: Users },
    ],
  },
  {
    // Always the signed-in user's own settings.
    id: "account",
    label: "Account",
    items: [
      { href: "/settings/integrations", label: "Integrations", icon: Plug },
      {
        href: "/settings/notifications",
        label: "Notifications",
        icon: Bell,
      },
      { href: "/settings/usage", label: "Usage & billing", icon: Gauge },
      {
        href: "/settings/general",
        label: "Preferences",
        icon: SlidersHorizontal,
      },
      { href: "/settings/account", label: "Account", icon: CircleUser },
    ],
  },
];

export const isNavItemActive = (item: AppNavItem, pathname: string) =>
  item.match ? item.match(pathname) : isAtOrBelow(pathname, item.href);

export const findActiveNavItem = (pathname: string) =>
  APP_NAV.flatMap((group) => group.items).find((item) =>
    isNavItemActive(item, pathname),
  );

/**
 * Client-side check for showing admin links only; /admin enforces access on
 * the server (including env-bootstrapped admins).
 */
export const hasAdminRole = (role: string | null | undefined) =>
  (role ?? "").split(",").some((value) => value.trim() === "admin");
