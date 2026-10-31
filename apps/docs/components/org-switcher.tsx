"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, Settings, User } from "lucide-react";
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
    // Scoped client data (brand kits, codes) belongs to the previous workspace.
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

function TeamInitial({ name }: { name: string }) {
  return (
    <span className="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-semibold uppercase">
      {name.trim().charAt(0) || "T"}
    </span>
  );
}

/** "Personal" + the user's teams. Renders nothing when signed out. */
export function OrgSwitcher({ className }: { className?: string }) {
  const { data: session } = authClient.useSession();
  const { data: teams } = authClient.useListOrganizations();
  const { switchTeam, isSwitching } = useSwitchTeam();
  const [open, setOpen] = useState(false);

  if (!session?.user) return null;

  const activeId = session.session.activeOrganizationId ?? null;
  // A stale id (e.g. removed from the team) falls back to Personal, like lib/scope.
  const active = teams?.find((team) => team.id === activeId) ?? null;

  const select = (organizationId: string | null) => {
    setOpen(false);
    if (organizationId !== (active?.id ?? null)) switchTeam(organizationId);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Switch workspace"
          className={cn("w-full justify-between gap-2 px-2", className)}
          disabled={isSwitching}
          variant="outline"
        >
          <span className="flex min-w-0 items-center gap-2">
            {active ? (
              <TeamInitial name={active.name} />
            ) : (
              <User className="size-4 shrink-0" />
            )}
            <span className="truncate">{active?.name ?? "Personal"}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
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
        <DropdownMenuSeparator />
        {active && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/team">
              <Settings className="size-4" />
              Team settings
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/dashboard/team?create=1">
            <Plus className="size-4" />
            Create team
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
