import {
  Notification as Bell,
  Chart as ChartNoAxesColumn,
  ProfileCircle as CircleUser,
  Code1 as CodeXml,
  FolderOpen,
  Speedometer as Gauge,
  Global as Globe,
  Home2 as Home,
  KeySquare,
  type Icon as LucideIcon,
  Element2 as PanelsTopLeft,
  Electricity as Plug,
  ScanBarcode as QrCode,
  Setting2,
  ShieldTick,
  Setting4 as SlidersHorizontal,
  ColorsSquare as SwatchBook,
  Profile2User as Users,
  Share as Webhook,
} from "iconsax-reactjs";
import { workspaceHref } from "@/lib/workspace-paths";

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
 * The app's main sidebar. Everything here belongs to the workspace open in
 * the URL (/dashboard/<slug>/...), picked in the switcher.
 */
export function mainNav(slug: string): AppNavGroup[] {
  const home = workspaceHref(slug);
  return [
    {
      id: "main",
      items: [
        {
          href: home,
          label: "Home",
          icon: Home,
          match: (pathname) => pathname === home,
          keywords: ["dashboard", "overview", "setup"],
        },
        {
          href: workspaceHref(slug, "/codes"),
          label: "Codes",
          icon: QrCode,
          keywords: ["dynamic", "qr", "short links", "import"],
        },
        {
          href: workspaceHref(slug, "/pages"),
          label: "Pages & forms",
          icon: PanelsTopLeft,
          keywords: ["landing pages", "forms", "responses", "menu", "vcard"],
        },
        {
          href: workspaceHref(slug, "/analytics"),
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
          href: workspaceHref(slug, "/files"),
          label: "Files",
          icon: FolderOpen,
          keywords: ["uploads", "pdf", "images", "storage"],
        },
        {
          href: workspaceHref(slug, "/themes"),
          label: "Themes",
          icon: SwatchBook,
          keywords: ["brand", "logo", "colors", "design"],
        },
      ],
    },
  ];
}

/**
 * The settings area (its own sidebar, with a way back to the dashboard).
 * Workspace settings live under /dashboard/<slug>/settings and follow the
 * switcher; Account is the signed-in person, under /settings, the same in
 * every workspace.
 */
export function settingsNav(slug: string): AppNavGroup[] {
  const general = workspaceHref(slug, "/settings");
  return [
    {
      id: "workspace",
      label: "Workspace",
      items: [
        {
          href: general,
          label: "General",
          icon: Setting2,
          match: (pathname) => pathname === general,
          keywords: ["name", "url", "slug", "rename", "delete", "leave"],
        },
        {
          href: workspaceHref(slug, "/settings/usage"),
          label: "Plan & usage",
          icon: Gauge,
          keywords: [
            "billing",
            "subscription",
            "limits",
            "upgrade",
            "invoices",
          ],
        },
        {
          href: workspaceHref(slug, "/settings/team"),
          label: "Team",
          icon: Users,
          keywords: ["members", "invite", "roles"],
        },
        {
          href: workspaceHref(slug, "/settings/domains"),
          label: "Domains",
          icon: Globe,
          keywords: ["custom domain", "dns"],
        },
        {
          href: workspaceHref(slug, "/settings/sso"),
          label: "Single sign-on",
          icon: KeySquare,
          keywords: ["sso", "saml", "oidc", "okta", "identity provider"],
        },
        {
          href: workspaceHref(slug, "/settings/webhooks"),
          label: "Webhooks",
          icon: Webhook,
          keywords: ["events", "zapier", "slack", "discord"],
        },
        {
          href: workspaceHref(slug, "/settings/developers"),
          label: "API keys & apps",
          icon: CodeXml,
          keywords: ["api", "oauth", "developers", "keys"],
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
        {
          href: "/settings/integrations",
          label: "Integrations",
          icon: Plug,
          keywords: ["connect", "bitly", "dropbox", "stripe", "mcp"],
        },
        {
          href: "/settings/authorized-apps",
          label: "Authorized apps",
          icon: ShieldTick,
          keywords: ["oauth", "access", "revoke"],
        },
      ],
    },
  ];
}

/** Where the switcher's Settings link goes: the workspace's General page. */
export const settingsHome = (slug: string) => workspaceHref(slug, "/settings");

/** Every app destination in a workspace, main nav first. */
export function allNavItems(slug: string): AppNavItem[] {
  return [...mainNav(slug), ...settingsNav(slug)].flatMap(
    (group) => group.items,
  );
}

export const isNavItemActive = (item: AppNavItem, pathname: string) =>
  item.match ? item.match(pathname) : isAtOrBelow(pathname, item.href);

export const findActiveNavItem = (pathname: string, slug: string) =>
  allNavItems(slug).find((item) => isNavItemActive(item, pathname));

/** True on any settings page: the account's and the workspace's. */
export const isSettingsPath = (pathname: string) =>
  isAtOrBelow(pathname, "/settings") ||
  /^\/dashboard\/[^/]+\/settings(?:\/|$)/.test(pathname);

/**
 * Client-side check for showing admin links only; /admin enforces access on
 * the server (including env-bootstrapped admins).
 */
export const hasAdminRole = (role: string | null | undefined) =>
  (role ?? "").split(",").some((value) => value.trim() === "admin");
