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
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useId, useState } from "react";
import { AdminAction } from "./admin-action";

/**
 * Downloads the user's data: the same ZIP as Settings → Account. A plain form
 * POST, so the browser streams the file; the route re-checks admin and logs
 * the export with the reason.
 */
export function ExportDataAction({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Export data
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export {email}&apos;s data</DialogTitle>
          <DialogDescription>
            A ZIP of everything QRdx keeps about them, the same as their own
            download. Handle it as personal data.
          </DialogDescription>
        </DialogHeader>
        <form
          action={`/admin/users/${encodeURIComponent(userId)}/export`}
          className="space-y-3"
          method="post"
          onSubmit={() => setTimeout(() => setOpen(false), 0)}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-reason`}>Reason</Label>
            <Textarea
              id={`${id}-reason`}
              maxLength={500}
              minLength={3}
              name="reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Data access request, ticket 1234"
              required
              value={reason}
            />
            <p className="text-muted-foreground text-xs">
              Saved in the audit log with your name.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setOpen(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button disabled={reason.trim().length < 3} type="submit">
              Download ZIP
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAccountAction({
  userId,
  email,
  isSelf,
}: {
  userId: string;
  email: string;
  isSelf: boolean;
}) {
  return (
    <AdminAction
      action="deleteAccount"
      confirmLabel="Delete account"
      description="Permanent. Same as their own deletion: team content goes to a remaining member, their personal codes stop working, files and domains are removed. Not allowed while they pay (cancel in Polar first) or for admins."
      destructive
      disabled={isSelf}
      disabledHint="Delete your own account from Settings"
      input={{ userId }}
      label="Delete account"
      redirectTo="/admin/users"
      success={`Deleted ${email}`}
      title={`Delete ${email}`}
      typeToConfirm={email}
    />
  );
}
