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
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteTeam, leaveTeam } from "@/actions/organizations";
import {
  ConfirmIdentityProvider,
  useConfirmation,
} from "@/components/confirm-identity/provider";
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
  const t = useTranslations("app.dashboard.team.dangerZone");
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
      toast.success(t("youLeftTeamname", { teamName }));
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
        <Button variant="outline">{t("leaveWorkspace")}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("leaveTeamname", { teamName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("youLoseAccessToIts")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault();
              leave();
            }}
          >
            {t("leaveWorkspace")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Deleting a workspace asks "Confirm it's you" after the typed URL, when
 * this session hasn't recently. Leaving one never does.
 */
export function DeleteTeamButton(props: {
  organizationId: string;
  teamName: string;
  teamSlug: string;
}) {
  return (
    <ConfirmIdentityProvider>
      <DeleteTeamDialog {...props} />
    </ConfirmIdentityProvider>
  );
}

function DeleteTeamDialog({
  organizationId,
  teamName,
  teamSlug,
}: {
  organizationId: string;
  teamName: string;
  teamSlug: string;
}) {
  const t = useTranslations("app.dashboard.team.dangerZone");
  const refresh = useRefreshTeams();
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const [open, setOpen] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [isPending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await withConfirmation(
        () => deleteTeam({ organizationId, confirmSlug }),
        "delete-workspace",
      );
      if (result === null) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(t("deletedTeamname", { teamName }));
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
        <Button variant="destructive">{t("deleteWorkspace")}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("deleteTeamname", { teamName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("thisRemovesTheWorkspaceIts")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-team-slug">
            {t.rich("typeToConfirm", {
              word: teamSlug,
              code: (chunks) => (
                <span className="font-mono font-semibold">{chunks}</span>
              ),
            })}
          </Label>
          <Input
            autoComplete="off"
            id="confirm-team-slug"
            onChange={(event) => setConfirmSlug(event.target.value)}
            value={confirmSlug}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90 text-white"
            disabled={isPending || confirmSlug !== teamSlug}
            onClick={(event) => {
              event.preventDefault();
              remove();
            }}
          >
            {isPending ? t("deleting") : t("deleteWorkspace")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
