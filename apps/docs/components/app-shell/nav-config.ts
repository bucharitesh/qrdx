import {
  Notification as Bell,
  Chart as ChartNoAxesColumn,
  ProfileCircle as CircleUser,
  Code1 as CodeXml,
  FolderOpen,
  Speedometer as Gauge,
  Global as Globe,
  Home2 as Home,
  type Icon as LucideIcon,
  Element2 as PanelsTopLeft,
  Electricity as Plug,
  ScanBarcode as QrCode,
  ShieldTick,
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
  /** Extra words the ⌘K palette matches on (never shown). */
  keywords?: string[];
}

export interface AppNavGroup {
  id: string;
  /** Group heading; the first main group has none. */
  label?: string;
  items: AppNavItem[];
}

const isAtOrBelow = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/**
 * The app's main sidebar. Everything here belongs to the workspace picked in
 * the switcher (personal or a team).
 */
export const MAIN_NAV: AppNavGroup[] = [
  {
    id: "main",
    items: [
      {
        href: "/dashboard",
        label: "Home",
        icon: Home,
        match: (pathname) => pathname === "/dashboard",
        keywords: ["dashboard", "overview", "setup"],
      },
      {
        href: "/dashboard/codes",
        label: "Codes",
        icon: QrCode,
        keywords: ["dynamic", "qr", "short links", "import"],
      },
      {
        href: "/dashboard/pages",
        label: "Pages & forms",
        icon: PanelsTopLeft,
        keywords: ["landing pages", "forms", "responses", "menu", "vcard"],
      },
      {
        href: "/dashboard/analytics",
        label: "Analytics",
        icon: ChartNoAxesColumn,
        keywords: ["scans", "stats"],
      },
    ],
  },
  {
    id: "library",
    label: "Library",
    items: [
      {
        href: "/dashboard/files",
        label: "Files",
        icon: FolderOpen,
        keywords: ["uploads", "pdf", "images", "storage"],
      },
      {
        href: "/dashboard/themes",
        label: "Themes",
        icon: SwatchBook,
        keywords: ["brand", "logo", "colors", "design"],
      },
    ],
  },
];

/**
 * The settings area (its own sidebar, with a way back to the dashboard).
 * Workspace settings follow the switcher; Account is the signed-in person.
 * Team, Domains and Webhooks moved here in the nav only: their pages stay at
 * /dashboard/team, /dashboard/domains and /dashboard/webhooks, so printed
 * and bookmarked links keep working.
 */
export const SETTINGS_NAV: AppNavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        href: "/settings/usage",
        label: "Plan & usage",
        icon: Gauge,
        keywords: ["billing", "subscription", "limits", "upgrade", "invoices"],
      },
      {
        href: "/dashboard/team",
        label: "Team",
        icon: Users,
        keywords: ["members", "invite", "workspace"],
      },
      {
        href: "/dashboard/domains",
        label: "Domains",
        icon: Globe,
        keywords: ["custom domain", "dns"],
      },
      {
        href: "/dashboard/webhooks",
        label: "Webhooks",
        icon: Webhook,
        keywords: ["events", "zapier", "slack", "discord"],
      },
      {
        href: "/settings/integrations",
        label: "Integrations",
        icon: Plug,
        keywords: ["connect", "bitly", "dropbox", "stripe", "mcp"],
      },
    ],
  },
  {
    id: "developer",
    label: "Developer",
    items: [
      {
        href: "/settings/developers",
        label: "API keys & apps",
        icon: CodeXml,
        keywords: ["api", "oauth", "developers", "keys"],
      },
      {
        href: "/settings/authorized-apps",
        label: "Authorized apps",
        icon: ShieldTick,
        keywords: ["oauth", "access", "revoke"],
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      {
        href: "/settings/account",
        label: "Profile & security",
        icon: CircleUser,
        keywords: ["account", "email", "sign-in", "sessions", "delete"],
      },
      {
        href: "/settings/general",
        label: "Preferences",
        icon: SlidersHorizontal,
        keywords: ["appearance", "dark mode", "sounds", "shortcuts"],
      },
      {
        href: "/settings/notifications",
        label: "Notifications",
        icon: Bell,
        keywords: ["email", "digest", "slack", "discord", "alerts"],
      },
    ],
  },
];

/** Where the sidebar's Settings link goes. */
export const SETTINGS_HOME = "/settings/usage";

/** Every app destination, main nav first. */
export const ALL_NAV_ITEMS: AppNavItem[] = [
  ...MAIN_NAV,
  ...SETTINGS_NAV,
].flatMap((group) => group.items);

export const isNavItemActive = (item: AppNavItem, pathname: string) =>
  item.match ? item.match(pathname) : isAtOrBelow(pathname, item.href);

export const findActiveNavItem = (pathname: string) =>
  ALL_NAV_ITEMS.find((item) => isNavItemActive(item, pathname));

/** True on any settings page, including those under /dashboard. */
export const isSettingsPath = (pathname: string) =>
  isAtOrBelow(pathname, "/settings") ||
  SETTINGS_NAV.some((group) =>
    group.items.some((item) => isNavItemActive(item, pathname)),
  );

/**
 * Client-side check for showing admin links only; /admin enforces access on
 * the server (including env-bootstrapped admins).
 */
export const hasAdminRole = (role: string | null | undefined) =>
  (role ?? "").split(",").some((value) => value.trim() === "admin");
