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
} from "iconsax-reactjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactElement, useId } from "react";
import { useAvailability } from "@/components/availability-provider";
import { OrgSwitcher } from "@/components/org-switcher";
import { PLAN_NAMES } from "@/lib/pricing";
import {
  type AppNavGroup,
  isNavItemActive,
  isSettingsPath,
  MAIN_NAV,
  SETTINGS_NAV,
} from "./nav-config";
import type { ShellData } from "./shell-data";

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

/**
 * The sidebar, shared by the desktop rail and the mobile sheet. Dashboard
 * pages get the product nav; settings pages get their own area with a way
 * back. Both end with the workspace switcher, whose menu also leads to
 * settings and Plan & usage. Team, Domains and Webhooks sit in settings while
 * their URLs stay under /dashboard. The list scrolls; both ends stay put.
 * `collapsed` turns it into an icon rail (desktop only).
 */
export function AppSidebar({
  shell,
  collapsed = false,
  onCollapsedChange,
  onNavigate,
}: {
  shell: ShellData | null;
  collapsed?: boolean;
  /** Present on the desktop rail, which can collapse; absent in the sheet. */
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const inSettings = isSettingsPath(pathname);
  const planName = shell ? PLAN_NAMES[shell.plan] : undefined;

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
          href="/dashboard"
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
          groups={inSettings ? SETTINGS_NAV : MAIN_NAV}
          label={inSettings ? "Settings" : "Dashboard"}
          onNavigate={onNavigate}
        />
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
          side="top"
        />
      </div>
    </div>
  );
}
