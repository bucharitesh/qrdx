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
import { useTranslations } from "next-intl";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
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
  const t = useTranslations("app.dashboard.webhooks.secretDialog");
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={secret !== null}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            aria-label={t("signingSecret")}
            className="font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={secret ?? ""}
          />
          <CopyButton label={t("copySigningSecret")} value={secret ?? ""} />
        </div>
        <p className="text-muted-foreground text-xs">
          {t.rich("everyRequestCarriesAnX", {
            code: (chunks) => <code className="font-mono">{chunks}</code>,
            link: (chunks) => (
              <Link
                className="underline"
                href="/docs/webhooks#verify-signatures"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
        <DialogFooter>
          <Button onClick={onClose}>{t("done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
