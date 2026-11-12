"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowLeft,
  type Icon,
  SidebarLeft,
  SidebarRight,
  Star,
} from "iconsax-reactjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type ReactElement,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import type { Meter } from "@/app/(app)/settings/usage/_lib/meters";
import { useAvailability } from "@/components/availability-provider";
import { useContentText } from "@/components/i18n/content-text";
import { OrgSwitcher } from "@/components/org-switcher";
import { useCan } from "@/components/workspace-provider";
import { unreadLabel } from "@/lib/changelog-feed";
import { PLAN_NAMES } from "@/lib/pricing";
import { useCreate } from "./create-actions";
import { LimitNotice } from "./limit-notice";
import {
  AREA_ROW_ICON,
  areaForPath,
  areaOffset,
  NAV_AREAS,
  type NavAction,
  type NavArea,
  type NavAreaId,
  type NavRow,
  navAreas,
} from "./nav-areas";
import { isNavItemActive } from "./nav-config";
import type { ShellData } from "./shell-data";
import { useWhatsNew } from "./whats-new";

// The focus ring is inset: the area panels clip their sides (they slide),
// and an outside ring would be cut off there. Keyboard focus only.
const rowClass =
  "hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-ring/50 flex shrink-0 items-center rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-inset";

/** In the icon rail every row is a square with its label in a tooltip. */
function RailTip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: ReactElement;
}) {
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavLink({
  href,
  label,
  icon: ItemIcon,
  active = false,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: Icon;
  active?: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <RailTip collapsed={collapsed} label={label}>
      <Link
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? label : undefined}
        className={cn(
          rowClass,
          collapsed ? "size-9 justify-center" : "h-8 w-full gap-2.5 px-2.5",
          active
            ? "bg-foreground/[0.07] text-foreground"
            : "text-muted-foreground",
        )}
        href={href}
        onClick={onNavigate}
      >
        <ItemIcon
          aria-hidden
          className="size-4 shrink-0"
          variant={active ? "Bold" : "Linear"}
        />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    </RailTip>
  );
}

/** A row that opens another area, ending with a chevron. */
function AreaRow({
  row,
  collapsed,
  onArea,
}: {
  row: Extract<NavRow, { kind: "area" }>;
  collapsed: boolean;
  onArea: (href: string, byKeyboard: boolean) => void;
}) {
  const tc = useContentText();
  const ItemIcon = row.icon;
  return (
    <RailTip collapsed={collapsed} label={tc(row.label)}>
      <Link
        aria-label={collapsed ? tc(row.label) : undefined}
        className={cn(
          rowClass,
          "group text-muted-foreground",
          collapsed ? "size-9 justify-center" : "h-8 w-full gap-2.5 px-2.5",
        )}
        data-area-row={row.area}
        href={row.href}
        // A click from Enter or Space has no pointer details (detail 0).
        onClick={(event) => onArea(row.href, event.detail === 0)}
      >
        <ItemIcon aria-hidden className="size-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{tc(row.label)}</span>
            <AREA_ROW_ICON
              aria-hidden
              className="text-muted-foreground/70 size-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </>
        )}
      </Link>
    </RailTip>
  );
}

/** A row that starts something here, without leaving the page. */
function ActionRow({
  row,
  collapsed,
  onAction,
}: {
  row: Extract<NavRow, { kind: "action" }>;
  collapsed: boolean;
  onAction: (action: NavAction) => void;
}) {
  const tc = useContentText();
  const ItemIcon = row.icon;
  return (
    <RailTip collapsed={collapsed} label={tc(row.label)}>
      <button
        aria-label={collapsed ? tc(row.label) : undefined}
        className={cn(
          rowClass,
          "text-muted-foreground",
          collapsed ? "size-9 justify-center" : "h-8 w-full gap-2.5 px-2.5",
        )}
        onClick={() => onAction(row.action)}
        type="button"
      >
        <ItemIcon aria-hidden className="size-4 shrink-0" />
        {!collapsed && (
          <span className="truncate text-left">{tc(row.label)}</span>
        )}
      </button>
    </RailTip>
  );
}

/**
 * One area's panel: its way back and title, then its groups. Every area is
 * rendered; the open one sits in place and the others wait off to their
 * side (areaOffset), faded and inert, so a change of area slides them.
 */
function AreaPanel({
  area,
  offset,
  collapsed,
  onNavigate,
  onArea,
  onAction,
}: {
  area: NavArea;
  /** -1 waiting on the left, 0 open, 1 waiting on the right */
  offset: -1 | 0 | 1;
  collapsed: boolean;
  onNavigate?: () => void;
  onArea: (href: string, byKeyboard: boolean) => void;
  onAction: (action: NavAction) => void;
}) {
  const tc = useContentText();
  const t = useTranslations("app.shell.appSidebar");
  const pathname = usePathname();
  // Rendered twice (rail + sheet), so ids must be unique per instance.
  const idPrefix = useId();
  // Pages for features this deployment can't offer (e.g. adding custom
  // domains) aren't linked; their URLs keep working for existing users.
  const { showsPath } = useAvailability();
  const open = offset === 0;
  const groups = area.groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) =>
        row.kind === "link"
          ? showsPath(row.item.href)
          : row.kind === "area"
            ? showsPath(row.href)
            : true,
      ),
    }))
    .filter((group) => group.rows.length > 0);
  const titleId = `${idPrefix}-title`;

  return (
    <div
      aria-hidden={open ? undefined : true}
      className={cn(
        "flex w-full flex-col transition-[translate,opacity] duration-[220ms] ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none",
        open
          ? "relative"
          : "pointer-events-none absolute inset-x-0 top-0 opacity-0",
        offset < 0 && "-translate-x-full",
        offset > 0 && "translate-x-full",
      )}
      data-area-panel={area.id}
      inert={!open}
    >
      {area.back && (
        <RailTip
          collapsed={collapsed}
          label={t("backToLabel", { label: tc(area.back.label) })}
        >
          <Link
            aria-label={
              collapsed
                ? t("backToLabel", { label: tc(area.back.label) })
                : undefined
            }
            className={cn(
              rowClass,
              "text-muted-foreground mb-1",
              collapsed
                ? "size-9 self-center justify-center"
                : "h-8 w-full gap-2 px-2.5",
            )}
            data-area-back=""
            href={area.back.href}
            onClick={(event) =>
              onArea(area.back?.href ?? "", event.detail === 0)
            }
          >
            <ArrowLeft aria-hidden className="size-4 shrink-0" />
            {!collapsed && (
              <span className="truncate">{tc(area.back.label)}</span>
            )}
          </Link>
        </RailTip>
      )}
      {area.back && !collapsed && (
        <h2 className="px-2.5 pt-1 pb-3 text-base font-semibold" id={titleId}>
          {tc(area.title)}
        </h2>
      )}
      <nav
        aria-label={area.back && !collapsed ? undefined : tc(area.title)}
        aria-labelledby={area.back && !collapsed ? titleId : undefined}
        className={cn("flex flex-col", collapsed ? "items-center" : "gap-4")}
      >
        {groups.map((group, index) => {
          const labelId = `${idPrefix}-${group.id}`;
          return (
            <div
              className={cn(
                "flex w-full flex-col gap-0.5",
                collapsed && "items-center",
              )}
              key={group.id}
            >
              {collapsed
                ? index > 0 && (
                    <span aria-hidden className="bg-border my-2 h-px w-6" />
                  )
                : group.label && (
                    <div
                      className="text-muted-foreground px-2.5 pb-1 text-xs font-medium"
                      id={labelId}
                    >
                      {tc(group.label)}
                    </div>
                  )}
              <ul
                aria-label={
                  collapsed && group.label ? tc(group.label) : undefined
                }
                aria-labelledby={
                  !collapsed && group.label ? labelId : undefined
                }
                className={cn(
                  "flex w-full flex-col gap-0.5",
                  collapsed && "items-center",
                )}
              >
                {group.rows.map((row) => (
                  <li
                    key={
                      row.kind === "link"
                        ? row.item.href
                        : row.kind === "area"
                          ? `area:${row.area}`
                          : `action:${row.action}`
                    }
                  >
                    {row.kind === "link" ? (
                      <NavLink
                        active={isNavItemActive(row.item, pathname)}
                        collapsed={collapsed}
                        href={row.item.href}
                        icon={row.item.icon}
                        label={tc(row.item.label)}
                        onNavigate={onNavigate}
                      />
                    ) : row.kind === "area" ? (
                      <AreaRow
                        collapsed={collapsed}
                        onArea={onArea}
                        row={row}
                      />
                    ) : (
                      <ActionRow
                        collapsed={collapsed}
                        onAction={onAction}
                        row={row}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

/** Opens the "What's new" panel; a count while there are unread entries. */
function WhatsNewRow({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("app.shell.appSidebar");
  const whatsNew = useWhatsNew();
  if (!whatsNew || whatsNew.items.length === 0) return null;
  const { unread, openPanel } = whatsNew;
  const label =
    unread > 0 ? `What's new, ${unreadLabel(unread)} unread` : "What's new";

  return (
    <RailTip collapsed={collapsed} label={label}>
      <button
        aria-label={collapsed || unread > 0 ? label : undefined}
        className={cn(
          rowClass,
          "text-muted-foreground relative",
          collapsed ? "size-9 justify-center" : "h-8 w-full gap-2.5 px-2.5",
        )}
        onClick={() => {
          onNavigate?.();
          openPanel();
        }}
        type="button"
      >
        <Star aria-hidden className="size-4 shrink-0" />
        {!collapsed && (
          <span className="flex-1 truncate text-left">{t("whatsNew")}</span>
        )}
        {unread > 0 &&
          (collapsed ? (
            <span
              aria-hidden
              className="bg-primary ring-sidebar absolute top-2 right-2 size-1.5 rounded-full ring-2"
            />
          ) : (
            <span
              aria-hidden
              className="bg-primary/10 text-primary rounded-full px-1.5 text-[11px] leading-5 font-medium tabular-nums"
            >
              {unreadLabel(unread)}
            </span>
          ))}
      </button>
    </RailTip>
  );
}

/**
 * The sidebar, shared by the desktop rail and the mobile sheet. Its areas
 * (nav-areas.ts) are the dashboard, Codes, Pages & forms and Settings; the
 * URL picks the open one, and changing it slides the panels sideways
 * (deeper from the right, back from the left; instant with reduced
 * motion). The collapse toggle, What's new and the workspace switcher stay
 * put in every area. `collapsed` turns it into an icon rail (desktop only).
 * Without shell data (signed out, or the lookup failed) only the account
 * settings are listed.
 */
export function AppSidebar({
  shell,
  limitWarnings = null,
  collapsed = false,
  onCollapsedChange,
  onNavigate,
  onAreaNavigate,
}: {
  shell: ShellData | null;
  /** Limits at 90% or more, streamed from the server (app-shell.tsx) */
  limitWarnings?: Promise<Meter[]> | null;
  collapsed?: boolean;
  /** Present on the desktop rail, which can collapse; absent in the sheet. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** A page was picked (the sheet closes) */
  onNavigate?: () => void;
  /** Another area was opened at `href` (the sheet stays open to show it) */
  onAreaNavigate?: (href: string) => void;
}) {
  const t = useTranslations("app.shell.appSidebar");
  const pathname = usePathname();
  const create = useCreate();
  const planName = shell ? PLAN_NAMES[shell.plan] : undefined;
  const slug = shell?.workspace.slug ?? null;
  // Viewers and billing members get no create-only rows (lib/permissions.ts).
  const canWrite = useCan("content.write");
  const areas = useMemo(() => navAreas(slug, { canWrite }), [slug, canWrite]);
  const current = areaForPath(pathname, slug);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shown = useRef(current);
  // Set when the keyboard changed the area from this sidebar, so focus
  // follows into the new panel (a pointer click leaves focus alone).
  const leaving = useRef<NavAreaId | null>(null);

  useEffect(() => {
    const left = shown.current;
    shown.current = current;
    if (left === current) return;
    scrollRef.current?.scrollTo({ top: 0 });
    if (leaving.current === null) return;
    leaving.current = null;
    // The old panel went inert and took focus with it: land on the row that
    // leads back to it, else the new area's way back, else its first item.
    const panel = rootRef.current?.querySelector(
      `[data-area-panel="${current}"]`,
    );
    const target =
      panel?.querySelector<HTMLElement>(`[data-area-row="${left}"]`) ??
      panel?.querySelector<HTMLElement>("[data-area-back]") ??
      panel?.querySelector<HTMLElement>("a[href], button");
    target?.focus({ preventScroll: true });
  }, [current]);

  const openArea = (href: string, byKeyboard: boolean) => {
    leaving.current = byKeyboard ? current : null;
    onAreaNavigate?.(href);
  };
  const runAction = (action: NavAction) => {
    onNavigate?.();
    create(action === "form-templates" ? "form" : "page");
  };

  const toggle = onCollapsedChange && (
    <RailTip
      collapsed={collapsed}
      label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
    >
      <Button
        aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
        className="text-muted-foreground size-8 shrink-0"
        onClick={() => onCollapsedChange(!collapsed)}
        size="icon"
        variant="ghost"
      >
        {collapsed ? (
          <SidebarRight aria-hidden className="size-4" />
        ) : (
          <SidebarLeft aria-hidden className="size-4" />
        )}
      </Button>
    </RailTip>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" ref={rootRef}>
      {toggle && (
        <div
          className={cn(
            "flex shrink-0 p-2.5 pb-1",
            collapsed ? "justify-center" : "justify-end",
          )}
        >
          {toggle}
        </div>
      )}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4 [scrollbar-width:thin]",
          collapsed ? "px-2" : "px-2.5",
          !toggle && "pt-2.5",
        )}
        ref={scrollRef}
      >
        {/* Clips the panels waiting off to either side. */}
        <div className="relative overflow-hidden">
          {NAV_AREAS.map((id) => (
            <AreaPanel
              area={areas[id]}
              collapsed={collapsed}
              key={id}
              offset={areaOffset(id, current)}
              onAction={runAction}
              onArea={openArea}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>

      <div
        className={cn(
          "flex shrink-0 flex-col gap-2 pb-2",
          collapsed ? "items-center px-2" : "px-2.5",
        )}
      >
        <WhatsNewRow collapsed={collapsed} onNavigate={onNavigate} />
        {shell && limitWarnings && (
          <Suspense fallback={null}>
            <LimitNotice
              collapsed={collapsed}
              onNavigate={onNavigate}
              plan={shell.plan}
              usageHref={shell.limits.usageHref}
              warnings={limitWarnings}
            />
          </Suspense>
        )}
      </div>

      <div
        className={cn(
          "shrink-0 border-t p-2.5",
          collapsed && "flex justify-center",
        )}
      >
        <OrgSwitcher
          collapsed={collapsed}
          onNavigate={onNavigate}
          planName={planName}
          shell={shell}
          side="top"
        />
      </div>
    </div>
  );
}
