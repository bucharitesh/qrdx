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
import { Refresh2 } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyButton } from "@/app/dashboard/webhooks/_components/event-checkboxes";
import { regenerateOAuthAppSecretAction } from "../_lib/actions";
import { formatDate } from "./format";
import { ClientSecretDialog } from "./secret-dialog";

export function AppCredentials({
  appId,
  clientId,
  createdAt,
  secretRotatedAt,
  canManage,
}: {
  appId: string;
  clientId: string;
  createdAt: Date;
  secretRotatedAt: Date | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const regenerate = () =>
    startTransition(async () => {
      const result = await regenerateOAuthAppSecretAction({ id: appId });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSecret(result.data.clientSecret);
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credentials</CardTitle>
        <CardDescription>
          Send both with every token request. The client ID is public; the
          secret belongs on your server only.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">Client ID</p>
            <code className="text-muted-foreground block font-mono text-xs break-all">
              {clientId}
            </code>
          </div>
          <CopyButton label="Copy client ID" value={clientId} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">Client secret</p>
            <p className="text-muted-foreground text-xs">
              Hidden. {secretRotatedAt ? "Regenerated" : "Created"}{" "}
              {formatDate(secretRotatedAt ?? createdAt)}.
            </p>
          </div>
          {canManage && (
            <Button
              disabled={pending}
              onClick={() => setConfirming(true)}
              size="sm"
              variant="outline"
            >
              <Refresh2 />
              Regenerate secret
            </Button>
          )}
        </div>
      </CardContent>

      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate the client secret?</AlertDialogTitle>
            <AlertDialogDescription>
              The current secret stops working right away, so token requests
              fail until your server uses the new one. People who already
              authorized your app stay connected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button disabled={pending} onClick={regenerate}>
              {pending ? "Regenerating…" : "Regenerate secret"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ClientSecretDialog
        credentials={secret ? { clientId, clientSecret: secret } : null}
        onClose={() => setSecret(null)}
        title="New client secret"
      />
    </Card>
  );
}
