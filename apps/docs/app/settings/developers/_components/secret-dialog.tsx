"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { CopyButton } from "@/app/dashboard/webhooks/_components/event-checkboxes";

function CopyField({ label, value }: { label: string; value: string }) {
  const id = `secret-dialog-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          className="font-mono text-xs"
          id={id}
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          value={value}
        />
        <CopyButton label={`Copy ${label.toLowerCase()}`} value={value} />
      </div>
    </div>
  );
}

/**
 * Shows a client secret right after it was created. It is never shown again:
 * only its hash is stored.
 */
export function ClientSecretDialog({
  credentials,
  title,
  onClose,
}: {
  credentials: { clientId: string; clientSecret: string } | null;
  title: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      onOpenChange={(open) => !open && onClose()}
      open={credentials !== null}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Copy the client secret now: QRdx stores only a hash of it, so it
            can't be shown again. Keep it on your server, never in a browser or
            mobile app.
          </DialogDescription>
        </DialogHeader>
        {credentials && (
          <div className="space-y-4">
            <CopyField label="Client ID" value={credentials.clientId} />
            <CopyField label="Client secret" value={credentials.clientSecret} />
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>I've saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
