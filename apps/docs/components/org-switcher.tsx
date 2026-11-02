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
  User,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

/**
 * Re-syncs client state after the active team or team list changed on the
 * server (server actions bypass Better Auth's client signals).
 */
export function useRefreshTeams() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(() => {
    authClient.$store.notify("$sessionSignal");
    authClient.$store.notify("$listOrg");
    authClient.$store.notify("$activeOrgSignal");
    // Scoped client data (themes, codes) belongs to the previous workspace.
    queryClient.invalidateQueries();
    router.refresh();
  }, [queryClient, router]);
}

/** Switches the active workspace: a team id, or null for Personal. */
export function useSwitchTeam() {
  const refresh = useRefreshTeams();
  const [isSwitching, startTransition] = useTransition();

  const switchTeam = useCallback(
    (organizationId: string | null) =>
      startTransition(async () => {
        const { error } = await authClient.organization.setActive({
          organizationId,
        });
        if (error) {
          toast.error(error.message ?? "Could not switch workspace");
          return;
        }
        refresh();
      }),
    [refresh],
  );

  return { switchTeam, isSwitching };
}

/** The workspace's letter tile (a person icon for Personal). */
function WorkspaceTile({ name }: { name: string | null }) {
  return (
    <span
      aria-hidden
      className="bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold uppercase"
    >
      {name === null ? (
        <User className="size-4" />
      ) : (
        name.trim().charAt(0) || "T"
      )}
    </span>
  );
}

function TeamInitial({ name }: { name: string }) {
  return (
    <span className="bg-muted text-foreground flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold uppercase">
      {name.trim().charAt(0) || "T"}
    </span>
  );
}

/**
 * "Personal" + the user's teams. Renders nothing when signed out. The
 * trigger is a tile with the workspace's name and plan; `collapsed` leaves
 * just the tile (the icon rail).
 */
export function OrgSwitcher({
  className,
  planName,
  collapsed = false,
  side = "bottom",
  onNavigate,
}: {
  className?: string;
  /** The active workspace's plan, e.g. "Business" (from the server). */
  planName?: string;
  collapsed?: boolean;
  /** Where the menu opens: below, or above (a switcher in a footer). */
  side?: "bottom" | "top";
  /** Called when a menu link is followed (e.g. to close the mobile sheet). */
  onNavigate?: () => void;
}) {
  const { data: session } = authClient.useSession();
  const { data: teams } = authClient.useListOrganizations();
  const { switchTeam, isSwitching } = useSwitchTeam();
  const [open, setOpen] = useState(false);

  if (!session?.user) return null;

  const activeId = session.session.activeOrganizationId ?? null;
  // A stale id (e.g. removed from the team) falls back to Personal, like lib/scope.
  const active = teams?.find((team) => team.id === activeId) ?? null;
  const name = active?.name ?? "Personal";
  // The name already says Personal; a team's meta says it's a team.
  const meta = planName
    ? `${active ? "Team · " : ""}${planName} plan`
    : active
      ? "Team"
      : "Personal workspace";

  const select = (organizationId: string | null) => {
    setOpen(false);
    if (organizationId !== (active?.id ?? null)) switchTeam(organizationId);
  };

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        aria-label={`Switch workspace (now ${name})`}
        className={cn(
          "hover:bg-foreground/[0.05] focus-visible:ring-ring/50 flex items-center rounded-lg text-left outline-none transition-colors focus-visible:ring-[3px] disabled:opacity-60",
          collapsed ? "size-10 justify-center" : "h-11 w-full gap-2.5 px-1.5",
          className,
        )}
        disabled={isSwitching}
        type="button"
      >
        <WorkspaceTile name={active ? active.name : null} />
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium leading-tight">
                {name}
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
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">{name}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent
        align="start"
        className="w-60"
        side={collapsed ? "right" : side}
      >
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Workspaces
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => select(null)}>
          <User className="size-4" />
          <span className="flex-1 truncate">Personal</span>
          {!active && <Check className="size-4" />}
        </DropdownMenuItem>
        {teams?.map((team) => (
          <DropdownMenuItem key={team.id} onSelect={() => select(team.id)}>
            <TeamInitial name={team.name} />
            <span className="flex-1 truncate">{team.name}</span>
            {active?.id === team.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <Link href="/dashboard/team?create=1" onClick={onNavigate}>
            <Plus className="size-4" />
            Create team
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/usage" onClick={onNavigate}>
            <Gauge className="size-4" />
            Plan & usage
          </Link>
        </DropdownMenuItem>
        {active && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/team" onClick={onNavigate}>
              <People className="size-4" />
              Team members
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings" onClick={onNavigate}>
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
