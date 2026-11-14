"use client";

import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { DialogClose } from "@repo/design-system/components/ui/dialog";
import { useTranslations } from "next-intl";

/**
 * A dialog's close (×) with a 40 px target on phones (the dialog's own is
 * the 16 px icon), in the same corner. Use with `showCloseButton={false}`.
 */
export function DialogCloseButton({ disabled }: { disabled?: boolean }) {
  const t = useTranslations("auth.dialogCloseButton");
  return (
    <DialogClose asChild>
      <Button
        aria-label={t("close")}
        className="text-muted-foreground hover:text-foreground absolute top-1 right-1 size-10 sm:top-2 sm:right-2 sm:size-8"
        disabled={disabled}
        size="icon-sm"
        variant="ghost"
      >
        <Close className="size-4" />
      </Button>
    </DialogClose>
  );
}
