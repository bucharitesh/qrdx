"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
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
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useId, useState } from "react";
import { DialogCloseButton } from "@/components/confirm-identity/dialog-close-button";
import { useConfirmation } from "@/components/confirm-identity/provider";
import {
  MAX_PASSKEY_NAME_LENGTH,
  type PasskeyView,
} from "@/lib/account/passkeys";
import { renamePasskey } from "../_lib/passkey-actions";

/** Renames a passkey (after "Confirm it's you"). */
export function RenamePasskeyDialog({
  passkey,
  onClose,
}: {
  passkey: PasskeyView | null;
  onClose: () => void;
}) {
  const t = useTranslations("app.settings.account.renamePasskeyDialog");
  const id = useId();
  const router = useRouter();
  const { withConfirmation } = useConfirmation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!passkey) return;
    setName(passkey.name);
    setError(null);
  }, [passkey]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passkey || saving) return;
    setSaving(true);
    try {
      const result = await withConfirmation(
        () => renamePasskey({ id: passkey.id, name }),
        "rename-passkey",
      );
      if (result === null) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(t("passkeyRenamed"));
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!(next || saving)) onClose();
      }}
      open={passkey !== null}
    >
      <DialogContent
        className="max-sm:[&_[data-slot=button]]:h-10 max-sm:[&_[data-slot=input]]:h-10 sm:max-w-md"
        showCloseButton={false}
      >
        <DialogCloseButton disabled={saving} />
        <DialogHeader>
          <DialogTitle>{t("renamePasskey")}</DialogTitle>
          <DialogDescription>{t("onlyYouSeeThisName")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor={`${id}-name`}>{t("name")}</Label>
            <Input
              aria-describedby={`${id}-error`}
              autoComplete="off"
              disabled={saving}
              id={`${id}-name`}
              maxLength={MAX_PASSKEY_NAME_LENGTH}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              value={name}
            />
          </div>
          <p
            aria-live="polite"
            className="text-destructive text-sm text-pretty empty:hidden"
            id={`${id}-error`}
            role={error ? "alert" : undefined}
          >
            {error}
          </p>
          <DialogFooter>
            <Button
              disabled={saving}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              {t("cancel")}
            </Button>
            <Button disabled={saving || !name.trim()} type="submit">
              {saving && <Spinner className="animate-spin" />}
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
