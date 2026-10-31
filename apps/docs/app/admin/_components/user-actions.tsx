"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type AdminActionResult,
  banUserAction,
  revokeUserSessionsAction,
  setUserRoleAction,
  unbanUserAction,
} from "../actions";

type Role = "user" | "admin";

export function UserActions({
  userId,
  email,
  banned,
  role,
  isSelf,
}: {
  userId: string;
  email: string;
  banned: boolean;
  role: string | null;
  isSelf: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [banOpen, setBanOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("");
  const currentRole: Role = role?.split(",").includes("admin")
    ? "admin"
    : "user";
  const [nextRole, setNextRole] = useState<Role>(currentRole);

  const run = (
    action: () => Promise<AdminActionResult>,
    success: string,
    onDone?: () => void,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        onDone?.();
      } else {
        toast.error(result.error);
      }
    });

  const submitBan = () => {
    const expiresInDays = days ? Number.parseInt(days, 10) : undefined;
    run(
      () =>
        banUserAction({ userId, reason: reason || undefined, expiresInDays }),
      `Banned ${email}`,
      () => {
        setBanOpen(false);
        setReason("");
        setDays("");
      },
    );
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {banned ? (
        <Button
          disabled={isPending}
          variant="outline"
          onClick={() =>
            run(() => unbanUserAction({ userId }), `Unbanned ${email}`)
          }
        >
          Unban
        </Button>
      ) : (
        <Dialog open={banOpen} onOpenChange={setBanOpen}>
          <DialogTrigger asChild>
            <Button disabled={isPending || isSelf} variant="destructive">
              Ban
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ban {email}</DialogTitle>
              <DialogDescription>
                Signs the user out everywhere and blocks new sign-ins.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ban-reason">Reason</Label>
                <Textarea
                  id="ban-reason"
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ban-days">Expires after (days, optional)</Label>
                <Input
                  id="ban-days"
                  inputMode="numeric"
                  min={1}
                  type="number"
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={isPending}
                variant="destructive"
                onClick={submitBan}
              >
                Confirm ban
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Button
        disabled={isPending}
        variant="outline"
        onClick={() => {
          if (!window.confirm(`Sign ${email} out of all sessions?`)) return;
          run(
            () => revokeUserSessionsAction({ userId }),
            `Revoked sessions for ${email}`,
          );
        }}
      >
        Revoke sessions
      </Button>

      <div className="flex items-end gap-2">
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select
            value={nextRole}
            onValueChange={(value: Role) => setNextRole(value)}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">user</SelectItem>
              <SelectItem value="admin">admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={isPending || nextRole === currentRole}
          variant="outline"
          onClick={() =>
            run(
              () => setUserRoleAction({ userId, role: nextRole }),
              `Role set to ${nextRole}`,
            )
          }
        >
          Save role
        </Button>
      </div>
    </div>
  );
}
