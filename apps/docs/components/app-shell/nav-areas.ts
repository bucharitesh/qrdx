// The sidebar's areas: one panel per area, with a way back, and the panel
// slides sideways when
// the area changes. The area always comes from the URL, so deep links,
// refresh and the back button land in the right one. Pure, so it's tested
// without a browser.

import {
  ArrowRight2,
  Barcode,
  Chart,
  ColorsSquare,
  DocumentText1,
  DocumentUpload,
  Element2,
  FolderOpen,
  Home2,
  type Icon,
  ScanBarcode,
  Setting2,
  TaskSquare,
} from "iconsax-reactjs";
import { workspaceHref } from "@/lib/workspace-paths";
import {
  type AppNavItem,
  isSettingsPath,
  settingsHome,
  settingsNav,
} from "./nav-config";

/** In order: an area waits off to the left of the ones after it. */
export const NAV_AREAS = ["dashboard", "codes", "pages", "settings"] as const;
export type NavAreaId = (typeof NAV_AREAS)[number];

/** What the "Page templates" and "Form templates" rows start. */
export type NavAction = "page-templates" | "form-templates";

export type NavRow =
  | { kind: "link"; item: AppNavItem }
  /** Opens another area (its page), e.g. Codes › from the dashboard */
  | { kind: "area"; area: NavAreaId; href: string; label: string; icon: Icon }
  /** Starts something without leaving the page */
  | { kind: "action"; action: NavAction; label: string; icon: Icon };

export interface NavAreaGroup {
  id: string;
  label?: string;
  rows: NavRow[];
}

export interface NavArea {
  id: NavAreaId;
  /** Shown as the panel's heading, and its nav's label */
  title: string;
  /** The way back; null for the top level */
  back: { href: string; label: string } | null;
  groups: NavAreaGroup[];
}

/** The chevron a row that opens an area ends with. */
export const AREA_ROW_ICON = ArrowRight2;

const isAtOrBelow = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

const link = (item: AppNavItem): NavRow => ({ kind: "link", item });

/**
 * Every area of a workspace. Without one (signed out, or the shell's lookup
 * failed) only the account settings are offered, as today. `canWrite`
 * false (viewers and billing members, lib/permissions.ts) leaves out the
 * rows that only create: Import and the page and form templates.
 */
export function navAreas(
  slug: string | null,
  { canWrite = true }: { canWrite?: boolean } = {},
): Record<NavAreaId, NavArea> {
  if (!slug) {
    const account = settingsNav("").filter((group) => group.id === "account");
    const empty = (id: NavAreaId, title: string): NavArea => ({
      id,
      title,
      back: null,
      groups: [],
    });
    return {
      dashboard: empty("dashboard", "Dashboard"),
      codes: empty("codes", "Codes"),
      pages: empty("pages", "Pages & forms"),
      settings: {
        id: "settings",
        title: "Settings",
        back: { href: "/dashboard", label: "Dashboard" },
        groups: account.map((group) => ({
          id: group.id,
          label: group.label,
          rows: group.items.map(link),
        })),
      },
    };
  }

  const home = workspaceHref(slug);
  const codes = workspaceHref(slug, "/codes");
  const codesImport = workspaceHref(slug, "/codes/import");
  const pages = workspaceHref(slug, "/pages");
  const back = { href: home, label: "Dashboard" };

  return {
    dashboard: {
      id: "dashboard",
      title: "Dashboard",
      back: null,
      groups: [
        {
          id: "main",
          rows: [
            link({
              href: home,
              label: "Home",
              icon: Home2,
              match: (pathname) => pathname === home,
            }),
            {
              kind: "area",
              area: "codes",
              href: codes,
              label: "Codes",
              icon: ScanBarcode,
            },
            {
              kind: "area",
              area: "pages",
              href: pages,
              label: "Pages & forms",
              icon: Element2,
            },
            // Saved static barcodes (lib/barcodes): one list, no area of its own.
            link({
              href: workspaceHref(slug, "/barcodes"),
              label: "Barcodes",
              icon: Barcode,
            }),
          ],
        },
        {
          // Shared by both areas: themes style every code (page codes
          // too), and files are the workspace's media library.
          id: "library",
          label: "Library",
          rows: [
            link({
              href: workspaceHref(slug, "/files"),
              label: "Files",
              icon: FolderOpen,
            }),
            link({
              href: workspaceHref(slug, "/themes"),
              label: "Themes",
              icon: ColorsSquare,
            }),
          ],
        },
        {
          id: "settings",
          rows: [
            {
              kind: "area",
              area: "settings",
              href: settingsHome(slug),
              label: "Settings",
              icon: Setting2,
            },
          ],
        },
      ],
    },
    codes: {
      id: "codes",
      title: "Codes",
      back,
      groups: [
        {
          id: "codes",
          rows: [
            link({
              href: codes,
              label: "All codes",
              icon: ScanBarcode,
              // A code's own page too; the import page has its row.
              match: (pathname) =>
                isAtOrBelow(pathname, codes) &&
                !isAtOrBelow(pathname, codesImport),
            }),
            link({
              href: workspaceHref(slug, "/analytics"),
              label: "Analytics",
              icon: Chart,
            }),
            ...(canWrite
              ? [
                  link({
                    href: codesImport,
                    label: "Import",
                    icon: DocumentUpload,
                  }),
                ]
              : []),
          ],
        },
      ],
    },
    pages: {
      id: "pages",
      title: "Pages & forms",
      back,
      groups: [
        {
          id: "pages",
          rows: [link({ href: pages, label: "All pages", icon: Element2 })],
        },
        ...(canWrite
          ? [
              {
                id: "templates",
                label: "Start from a template",
                rows: [
                  {
                    kind: "action",
                    action: "page-templates",
                    label: "Page templates",
                    icon: DocumentText1,
                  },
                  {
                    kind: "action",
                    action: "form-templates",
                    label: "Form templates",
                    icon: TaskSquare,
                  },
                ],
              } satisfies NavAreaGroup,
            ]
          : []),
      ],
    },
    settings: {
      id: "settings",
      title: "Settings",
      back,
      groups: settingsNav(slug).map((group) => ({
        id: group.id,
        label: group.label,
        rows: group.items.map(link),
      })),
    },
  };
}

/** The area a URL belongs to. */
export function areaForPath(pathname: string, slug: string | null): NavAreaId {
  if (isSettingsPath(pathname) || !slug) return "settings";
  const at = (path: string) => isAtOrBelow(pathname, workspaceHref(slug, path));
  if (at("/codes") || at("/analytics")) return "codes";
  if (at("/pages")) return "pages";
  return "dashboard";
}

/**
 * Where an area waits while another is open: -1 off to the left (it comes
 * before), 1 off to the right (after), 0 when it's the open one. So going
 * deeper slides in from the right and going back from the left.
 */
export function areaOffset(area: NavAreaId, current: NavAreaId): -1 | 0 | 1 {
  const delta = NAV_AREAS.indexOf(area) - NAV_AREAS.indexOf(current);
  return delta === 0 ? 0 : delta < 0 ? -1 : 1;
}

/** Which way the panels moved: "forward" when the new area is deeper. */
export function slideDirection(
  from: NavAreaId,
  to: NavAreaId,
): "forward" | "back" | null {
  const offset = areaOffset(to, from);
  return offset === 0 ? null : offset > 0 ? "forward" : "back";
}
