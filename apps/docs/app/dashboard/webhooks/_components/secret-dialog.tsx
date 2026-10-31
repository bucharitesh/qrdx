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
import Link from "next/link";
import { CopyButton } from "./event-checkboxes";

/** Shows a signing secret (after create, reveal or rotate). */
export function SecretDialog({
  secret,
  title,
  description,
  onClose,
}: {
  secret: string | null;
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={secret !== null}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            aria-label="Signing secret"
            className="font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={secret ?? ""}
          />
          <CopyButton label="Copy signing secret" value={secret ?? ""} />
        </div>
        <p className="text-muted-foreground text-xs">
          Every request carries an{" "}
          <code className="font-mono">X-QRdx-Signature</code> header: an
          HMAC-SHA256 of the timestamp and raw body made with this secret.{" "}
          <Link className="underline" href="/docs/webhooks#verify-signatures">
            How to verify it
          </Link>
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
