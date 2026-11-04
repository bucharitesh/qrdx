"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Tick as Check } from "@repo/design-system/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/design-system/components/ui/tooltip";
import { cn } from "@repo/design-system/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowSwapVertical as ChevronsUpDown,
  Speedometer as Gauge,
  People,
  Add as Plus,
  Setting2 as Settings,
} from "iconsax-reactjs";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type {
  ShellData,
  ShellWorkspace,
} from "@/components/app-shell/shell-data";
import { CreateWorkspaceDialog } from "@/components/workspaces/create-workspace-dialog";
import { WorkspaceAvatar } from "@/components/workspaces/workspace-avatar";
import { PLAN_NAMES } from "@/lib/pricing";
import { switchWorkspaceHref, workspaceHref } from "@/lib/workspace-paths";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";

/**
 * Re-syncs client state after workspaces changed on the server (created,
 * renamed, left, an invitation accepted): server actions bypass Better
 * Auth's client signals, and cached client data may belong to another
 * workspace.
 */
export function useRefreshTeams() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(() => {
    authClient.$store.notify("$sessionSignal");
    authClient.$store.notify("$listOrg");
    authClient.$store.notify("$activeOrgSignal");
    queryClient.invalidateQueries();
    router.refresh();
  }, [queryClient, router]);
}

/**
 * The open workspace and the person's others. Each entry is a link to the
 * same section in that workspace (/dashboard/<slug>/...), so it can open in
 * a new tab. Renders nothing without shell data. `collapsed` leaves just the
 * tile (the icon rail).
 */
export function OrgSwitcher({
  className,
  shell,
  planName,
  collapsed = false,
  side = "bottom",
  onNavigate,
}: {
  className?: string;
  shell: ShellData | null;
  /** The open workspace's plan, e.g. "Business" (from the server). */
  planName?: string;
  collapsed?: boolean;
  /** Where the menu opens: below, or above (a switcher in a footer). */
  side?: "bottom" | "top";
  /** Called when a menu link is followed (e.g. to close the mobile sheet). */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const openGetProDialog = useGetProDialogStore((s) => s.openGetProDialog);

  if (!shell) return null;
  const active: ShellWorkspace = shell.workspace;
  const meta = planName ? `${planName} plan` : "Workspace";

  const follow = () => {
    setOpen(false);
    onNavigate?.();
  };

  const startCreate = () => {
    setOpen(false);
    if (!shell.canCreateWorkspace) {
      toast.error(
        `More workspaces are part of ${PLAN_NAMES.pro} and ${PLAN_NAMES.business}.`,
      );
      openGetProDialog();
      return;
    }
    setCreating(true);
  };

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        aria-label={`Switch workspace (now ${active.name})`}
        className={cn(
          "hover:bg-foreground/[0.05] focus-visible:ring-ring/50 flex items-center rounded-lg text-left outline-none transition-colors focus-visible:ring-[3px]",
          collapsed ? "size-10 justify-center" : "h-11 w-full gap-2.5 px-1.5",
          className,
        )}
        type="button"
      >
        <WorkspaceAvatar logo={active.logo} name={active.name} size="sm" />
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium leading-tight">
                {active.name}
              </span>
              <span className="text-muted-foreground truncate text-xs leading-tight">
                {meta}
              </span>
            </span>
            <ChevronsUpDown
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
          </>
        )}
      </button>
    </DropdownMenuTrigger>
  );

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right">{active.name}</TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}
        <DropdownMenuContent
          align="start"
          className="w-64"
          side={collapsed ? "right" : side}
        >
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            Workspaces
          </DropdownMenuLabel>
          {shell.workspaces.map((workspace) => (
            <DropdownMenuItem asChild key={workspace.id}>
              <Link
                aria-current={workspace.id === active.id ? "page" : undefined}
                href={switchWorkspaceHref(pathname, workspace.slug)}
                onClick={follow}
              >
                <WorkspaceAvatar
                  logo={workspace.logo}
                  name={workspace.name}
                  size="xs"
                  tone="muted"
                />
                <span className="flex-1 truncate">{workspace.name}</span>
                {workspace.id === active.id && <Check className="size-4" />}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={startCreate}>
            <Plus className="size-4" />
            Create workspace
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link
              href={workspaceHref(active.slug, "/settings/usage")}
              onClick={follow}
            >
              <Gauge className="size-4" />
              Plan & usage
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href={workspaceHref(active.slug, "/settings/team")}
              onClick={follow}
            >
              <People className="size-4" />
              Team members
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href={workspaceHref(active.slug, "/settings")}
              onClick={follow}
            >
              <Settings className="size-4" />
              Settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog
        onOpenChange={(next) => {
          setCreating(next);
          if (!next) onNavigate?.();
        }}
        open={creating}
      />
    </>
  );
}
