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
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { CopyButton } from "@/app/(app)/dashboard/webhooks/_components/event-checkboxes";
import { useConfirmation } from "@/components/confirm-identity/provider";
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
  const t = useTranslations("app.settings.developers.appCredentials");
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const [confirming, setConfirming] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const regenerate = () =>
    startTransition(async () => {
      // Asks "Confirm it's you" first when this session hasn't recently.
      const result = await withConfirmation(
        () => regenerateOAuthAppSecretAction({ id: appId }),
        "new-client-secret",
      );
      if (result === null) return;
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
        <CardTitle>{t("credentials")}</CardTitle>
        <CardDescription>{t("sendBothWithEveryToken")}</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{t("clientId")}</p>
            <code className="text-muted-foreground block font-mono text-xs break-all">
              {clientId}
            </code>
          </div>
          <CopyButton label={t("copyClientId")} value={clientId} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">{t("clientSecret")}</p>
            <p className="text-muted-foreground text-xs">
              {t("hidden")} {secretRotatedAt ? t("regenerated") : t("created")}{" "}
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
              {t("regenerateSecret")}
            </Button>
          )}
        </div>
      </CardContent>

      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("regenerateTheClientSecret")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("theCurrentSecretStopsWorking")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button disabled={pending} onClick={regenerate}>
              {pending ? t("regenerating") : t("regenerateSecret")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ClientSecretDialog
        credentials={secret ? { clientId, clientSecret: secret } : null}
        onClose={() => setSecret(null)}
        title={t("newClientSecret")}
      />
    </Card>
  );
}
