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
      refresh();
    });

  if (disabledReason) {
    return <p className="text-muted-foreground text-sm">{disabledReason}</p>;
  }

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">Leave team</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave {teamName}?</AlertDialogTitle>
          <AlertDialogDescription>
            You lose access to the team's codes and themes. Codes you created
            stay with the team. You need a new invitation to rejoin.
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
            Leave team
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
        <Button variant="destructive">Delete team</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {teamName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the team, its members and pending invitations. The
            team's dynamic QR codes keep redirecting: each code, theme and
            domain moves to the personal workspace of the member who created it.
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
            {isPending ? "Deleting..." : "Delete team"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
