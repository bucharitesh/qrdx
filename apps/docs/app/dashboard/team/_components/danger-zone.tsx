"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTeam, leaveTeam } from "@/actions/organizations";
import { useRefreshTeams } from "@/components/org-switcher";

export function LeaveTeamButton({
  organizationId,
  teamName,
  disabledReason,
}: {
  organizationId: string;
  teamName: string;
  /** Shown instead of the button, e.g. for the only owner */
  disabledReason?: string;
}) {
  const refresh = useRefreshTeams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const leave = () =>
    startTransition(async () => {
      const result = await leaveTeam({ organizationId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(`You left ${teamName}`);
      // This workspace's pages are closed to you now: go to your default.
      router.replace("/dashboard");
      refresh();
    });

  if (disabledReason) {
    return <p className="text-muted-foreground text-sm">{disabledReason}</p>;
  }

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Leave workspace</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave {teamName}?</AlertDialogTitle>
          <AlertDialogDescription>
            You lose access to its codes, pages and themes. What you created
            stays in the workspace. You need a new invitation to rejoin.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              leave();
            }}
          >
            Leave workspace
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteTeamButton({
  organizationId,
  teamName,
  teamSlug,
}: {
  organizationId: string;
  teamName: string;
  teamSlug: string;
}) {
  const refresh = useRefreshTeams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [isPending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await deleteTeam({ organizationId, confirmSlug });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(`Deleted ${teamName}`);
      router.replace("/dashboard");
      refresh();
    });

  return (
    <AlertDialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmSlug("");
      }}
      open={open}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Delete workspace</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {teamName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the workspace, its members and pending invitations. Its
            dynamic QR codes keep redirecting: each code, page, theme and domain
            moves to the own workspace of the member who created it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-team-slug">
            Type <span className="font-mono font-semibold">{teamSlug}</span> to
            confirm
          </Label>
          <Input
            autoComplete="off"
            id="confirm-team-slug"
            onChange={(event) => setConfirmSlug(event.target.value)}
            value={confirmSlug}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-white"
            disabled={isPending || confirmSlug !== teamSlug}
            onClick={(event) => {
              event.preventDefault();
              remove();
            }}
          >
            {isPending ? "Deleting..." : "Delete workspace"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
