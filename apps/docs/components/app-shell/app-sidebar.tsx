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
import { type ReactElement, Suspense, useId } from "react";
import type { Meter } from "@/app/settings/usage/_lib/meters";
import { useAvailability } from "@/components/availability-provider";
import { OrgSwitcher } from "@/components/org-switcher";
import { unreadLabel } from "@/lib/changelog-feed";
import { PLAN_NAMES } from "@/lib/pricing";
import { workspaceHref } from "@/lib/workspace-paths";
import { LimitNotice } from "./limit-notice";
import {
  type AppNavGroup,
  isNavItemActive,
  isSettingsPath,
  mainNav,
  settingsNav,
} from "./nav-config";
import type { ShellData } from "./shell-data";
import { useWhatsNew } from "./whats-new";

const rowClass =
  "hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-ring/50 flex shrink-0 items-center rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-[3px]";

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

function NavGroups({
  groups,
  label,
  collapsed,
  onNavigate,
}: {
  groups: AppNavGroup[];
  label: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // Rendered twice (rail + sheet), so label ids must be unique per instance.
  const idPrefix = useId();
  // Pages for features this deployment can't offer (e.g. adding custom
  // domains) aren't linked; their URLs keep working for existing users.
  const { showsPath } = useAvailability();
  const visible = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => showsPath(item.href)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <nav
      aria-label={label}
      className={cn("flex flex-col", collapsed ? "items-center" : "gap-4")}
    >
      {visible.map((group, index) => {
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
                    {group.label}
                  </div>
                )}
            <ul
              aria-label={collapsed ? group.label : undefined}
              aria-labelledby={!collapsed && group.label ? labelId : undefined}
              className={cn(
                "flex w-full flex-col gap-0.5",
                collapsed && "items-center",
              )}
            >
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    active={isNavItemActive(item, pathname)}
                    collapsed={collapsed}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
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
          <span className="flex-1 truncate text-left">What's new</span>
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
 * The sidebar, shared by the desktop rail and the mobile sheet. Dashboard
 * pages get the product nav; settings pages (the workspace's and the
 * account's) get their own area with a way back. Both end with the workspace
 * switcher, whose menu also leads to settings and Plan & usage. The list
 * scrolls; both ends stay put. `collapsed` turns it into an icon rail
 * (desktop only). Without shell data (signed out, or the lookup failed) only
 * the account settings are listed.
 */
export function AppSidebar({
  shell,
  limitWarnings = null,
  collapsed = false,
  onCollapsedChange,
  onNavigate,
}: {
  shell: ShellData | null;
  /** Limits at 90% or more, streamed from the server (app-shell.tsx) */
  limitWarnings?: Promise<Meter[]> | null;
  collapsed?: boolean;
  /** Present on the desktop rail, which can collapse; absent in the sheet. */
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const inSettings = isSettingsPath(pathname);
  const planName = shell ? PLAN_NAMES[shell.plan] : undefined;
  const slug = shell?.workspace.slug ?? null;
  const dashboardHome = slug ? workspaceHref(slug) : "/dashboard";
  const groups = slug
    ? inSettings
      ? settingsNav(slug)
      : mainNav(slug)
    : settingsNav("").filter((group) => group.id === "account");

  const toggle = onCollapsedChange && (
    <RailTip
      collapsed={collapsed}
      label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      <Button
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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

  // Dashboard: the top holds only the collapse toggle (none in the sheet).
  // Settings: the way back. Both keep the workspace switcher at the foot.
  const head = inSettings ? (
    <div
      className={cn(
        "flex items-center",
        collapsed ? "flex-col gap-1" : "justify-between gap-2",
      )}
    >
      <RailTip collapsed={collapsed} label="Back to dashboard">
        <Link
          aria-label={collapsed ? "Back to dashboard" : undefined}
          className={cn(
            rowClass,
            "text-muted-foreground",
            collapsed ? "size-9 justify-center" : "h-8 min-w-0 gap-2 px-2.5",
          )}
          href={dashboardHome}
          onClick={onNavigate}
        >
          <ArrowLeft aria-hidden className="size-4 shrink-0" />
          {!collapsed && <span className="truncate">Dashboard</span>}
        </Link>
      </RailTip>
      {toggle}
    </div>
  ) : toggle ? (
    <div className={cn("flex", collapsed ? "justify-center" : "justify-end")}>
      {toggle}
    </div>
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {head && <div className="shrink-0 p-2.5">{head}</div>}

      <div
        className={cn(
          "min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4 [scrollbar-width:thin]",
          collapsed ? "px-2" : "px-2.5",
          !head && "pt-2.5",
        )}
      >
        {inSettings && !collapsed && (
          <h2 className="px-2.5 pt-1 pb-3 text-base font-semibold">Settings</h2>
        )}
        <NavGroups
          collapsed={collapsed}
          groups={groups}
          label={inSettings ? "Settings" : "Dashboard"}
          onNavigate={onNavigate}
        />
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
