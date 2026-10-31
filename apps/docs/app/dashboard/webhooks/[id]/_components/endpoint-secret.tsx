"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { CopyButton } from "../../_components/event-checkboxes";
import { revealWebhookSecret, rotateWebhookSecret } from "../../_lib/actions";

export function EndpointSecret({
  endpointId,
  secretPreview,
}: {
  endpointId: string;
  secretPreview: string;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [isPending, startTransition] = useTransition();

  const reveal = () => {
    if (secret) return setSecret(null);
    startTransition(async () => {
      const result = await revealWebhookSecret({ id: endpointId });
      if (result.ok) setSecret(result.data.secret);
      else toast.error(result.error);
    });
  };

  const rotate = () =>
    startTransition(async () => {
      const result = await rotateWebhookSecret({ id: endpointId });
      setConfirmRotate(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSecret(result.data.secret);
      toast.success("New secret created. Update your server to use it.");
    });

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Signing secret</CardTitle>
        <CardDescription>
          Verify the <code className="font-mono">X-QRdx-Signature</code> header
          with it. Only owners and admins can see it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 px-4">
        <Input
          aria-label="Signing secret"
          className="min-w-0 flex-1 font-mono text-xs"
          onFocus={(event) => secret && event.currentTarget.select()}
          readOnly
          value={secret ?? secretPreview}
        />
        <Button
          disabled={isPending}
          onClick={reveal}
          size="sm"
          variant="outline"
        >
          {secret ? <EyeOff /> : <Eye />}
          {secret ? "Hide" : "Reveal"}
        </Button>
        {secret && <CopyButton label="Copy signing secret" value={secret} />}
        <Button
          disabled={isPending}
          onClick={() => setConfirmRotate(true)}
          size="sm"
          variant="outline"
        >
          <RefreshCw />
          Rotate
        </Button>
      </CardContent>

      <AlertDialog onOpenChange={setConfirmRotate} open={confirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate the signing secret?</AlertDialogTitle>
            <AlertDialogDescription>
              The current secret stops working immediately, so requests fail
              your verification until your server uses the new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button disabled={isPending} onClick={rotate} variant="destructive">
              Rotate secret
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
