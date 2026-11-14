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
import {
  Eye,
  EyeSlash as EyeOff,
  Refresh2 as RefreshCw,
} from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useConfirmation } from "@/components/confirm-identity/provider";
import { CopyButton } from "../../_components/event-checkboxes";
import { revealWebhookSecret, rotateWebhookSecret } from "../../_lib/actions";

export function EndpointSecret({
  endpointId,
  secretPreview,
}: {
  endpointId: string;
  secretPreview: string;
}) {
  const t = useTranslations("app.dashboard.webhooks.endpointSecret");
  const { withConfirmation } = useConfirmation();
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Both ask "Confirm it's you" first when this session hasn't recently.
  const reveal = () => {
    if (secret) return setSecret(null);
    startTransition(async () => {
      const result = await withConfirmation(
        () => revealWebhookSecret({ id: endpointId }),
        "reveal-webhook-secret",
      );
      if (result === null) return;
      if (result.ok) setSecret(result.data.secret);
      else toast.error(result.error);
    });
  };

  const rotate = () =>
    startTransition(async () => {
      const result = await withConfirmation(
        () => rotateWebhookSecret({ id: endpointId }),
        "rotate-webhook-secret",
      );
      if (result === null) return;
      setConfirmRotate(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSecret(result.data.secret);
      toast.success(t("newSecretCreatedUpdateYour"));
    });

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{t("signingSecret")}</CardTitle>
        <CardDescription>
          {t.rich("verifyTheXQrdxSignature", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 px-4">
        <Input
          aria-label={t("signingSecret")}
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
          {secret ? t("hide") : t("reveal")}
        </Button>
        {secret && <CopyButton label={t("copySigningSecret")} value={secret} />}
        <Button
          disabled={isPending}
          onClick={() => setConfirmRotate(true)}
          size="sm"
          variant="outline"
        >
          <RefreshCw />
          {t("rotate")}
        </Button>
      </CardContent>

      <AlertDialog onOpenChange={setConfirmRotate} open={confirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rotateTheSigningSecret")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("theCurrentSecretStopsWorking")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <Button disabled={isPending} onClick={rotate} variant="destructive">
              {t("rotateSecret")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
