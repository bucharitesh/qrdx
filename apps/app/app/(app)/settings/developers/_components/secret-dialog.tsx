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
import { useTranslations } from "next-intl";
import { CopyField } from "./snippet";

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
  const t = useTranslations("app.settings.developers.secretDialog");
  return (
    <Dialog
      onOpenChange={(open) => !open && onClose()}
      open={credentials !== null}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("copyTheClientSecretNow")}</DialogDescription>
        </DialogHeader>
        {credentials && (
          <div className="space-y-4">
            <CopyField label={t("clientId")} value={credentials.clientId} />
            <CopyField
              label={t("clientSecret")}
              value={credentials.clientSecret}
            />
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{t("iveSavedIt")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
