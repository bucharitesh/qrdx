"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Copy, Link21, Refresh } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  disableWorkspaceJoinLink,
  issueWorkspaceJoinLink,
  setWorkspaceJoinLinkRole,
} from "@/actions/workspace-join";
import { inviteRolePhrase } from "@/lib/email/templates/team-invite";
import {
  assignableRoles,
  JOINABLE_ROLES,
  type WorkspaceRole,
} from "@/lib/permissions";
import { formatUtcDate } from "../_lib/team";
import { RoleSelect } from "./role-select";

export interface JoinLinkView {
  role: WorkspaceRole;
  createdAt: string;
  createdByName: string | null;
}

/**
 * The workspace's join link: on (with its role) or off. The link itself is
 * shown once, right after it's made or reset; only its hash is stored.
 */
export function JoinLinkCard({
  link: savedLink,
  currentRole,
}: {
  link: JoinLinkView | null;
  currentRole: WorkspaceRole;
}) {
  const router = useRouter();
  // The card follows each action's result at once; the page refresh that
  // follows (other parts of the page) never holds the buttons.
  const [link, setLink] = useState(savedLink);
  useEffect(() => setLink(savedLink), [savedLink]);
  const [isPending, setPending] = useState(false);
  const [role, setRole] = useState<WorkspaceRole>(savedLink?.role ?? "member");
  const [fresh, setFresh] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"reset" | "off" | null>(null);

  const roles = assignableRoles(currentRole).filter((r) =>
    JOINABLE_ROLES.includes(r),
  );
  // An admin can't change or reset a billing link an owner made.
  const canChange = link ? roles.includes(link.role) : true;
  const url = fresh ? new URL(fresh, window.location.origin).toString() : null;

  /** Runs an action with the buttons disabled; refreshes the page after. */
  const busy = async (run: () => Promise<boolean>) => {
    setPending(true);
    try {
      if (await run()) router.refresh();
    } finally {
      setPending(false);
    }
  };

  const issue = (nextRole?: WorkspaceRole) =>
    busy(async () => {
      const result = await issueWorkspaceJoinLink(
        nextRole ? { role: nextRole } : {},
      );
      setConfirm(null);
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      setFresh(result.data.path);
      setRole(result.data.role);
      setLink({
        role: result.data.role,
        createdAt: new Date().toISOString(),
        createdByName: null,
      });
      toast.success(link ? "Join link reset" : "Join link created");
      return true;
    });

  const changeRole = (next: WorkspaceRole) => {
    setRole(next);
    const current = link;
    if (!current) return;
    void busy(async () => {
      const result = await setWorkspaceJoinLinkRole({ role: next });
      if (!result.ok) {
        setRole(current.role);
        toast.error(result.error);
        return false;
      }
      setLink({ ...current, role: next });
      toast.success(`The link now adds people as ${inviteRolePhrase(next)}`);
      return true;
    });
  };

  const turnOff = () =>
    busy(async () => {
      const result = await disableWorkspaceJoinLink();
      setConfirm(null);
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      setFresh(null);
      setLink(null);
      toast.success("Join link turned off");
      return true;
    });

  const copy = () => {
    if (!url) return;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Join link copied"))
      .catch(() => toast.error("Couldn't copy the link"));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:w-40">
          <Label htmlFor="join-role">Joins as</Label>
          <RoleSelect
            className="w-full"
            disabled={isPending || !canChange}
            id="join-role"
            onChange={changeRole}
            roles={canChange ? roles : [role]}
            value={role}
          />
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          {link ? (
            <>
              <Button
                disabled={isPending || !canChange}
                onClick={() => setConfirm("reset")}
                variant="outline"
              >
                <Refresh aria-hidden />
                Reset link
              </Button>
              <Button
                disabled={isPending}
                onClick={() => setConfirm("off")}
                variant="ghost"
              >
                Turn off
              </Button>
            </>
          ) : (
            <Button disabled={isPending} onClick={() => void issue(role)}>
              {isPending ? (
                <Spinner aria-hidden className="animate-spin" />
              ) : (
                <Link21 aria-hidden />
              )}
              Create join link
            </Button>
          )}
        </div>
      </div>

      {link && !url && (
        <p className="text-muted-foreground text-sm text-pretty">
          On since {formatUtcDate(link.createdAt)}
          {link.createdByName ? `, made by ${link.createdByName}` : ""}. For
          safety the link is shown only when it's made. Lost it? Reset it to get
          a new one (the old one stops working).
        </p>
      )}

      {url && (
        <div className="bg-muted/40 space-y-2 rounded-lg border p-3">
          <p className="text-sm text-pretty">
            Copy it now: it's shown only once. Anyone signed in who opens it
            joins as {inviteRolePhrase(role)}.
          </p>
          <div className="flex gap-2">
            <Input
              aria-label="Join link"
              className="font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={url}
            />
            <Button onClick={copy} size="icon" variant="outline">
              <Copy aria-hidden />
              <span className="sr-only">Copy join link</span>
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        onOpenChange={(open) => !open && setConfirm(null)}
        open={confirm !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "reset"
                ? "Reset the join link?"
                : "Turn off the join link?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "reset"
                ? "The current link stops working right away. You get a new one to share."
                : "The link stops working right away. People who already joined stay members."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                if (confirm === "reset") void issue();
                else void turnOff();
              }}
            >
              {confirm === "reset" ? "Reset link" : "Turn off"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
