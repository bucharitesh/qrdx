"use client";

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
import { ArrowRotateLeft as History } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { restoreQrCodeVersion } from "@/actions/bulk-codes";
import { useOrganizeAction } from "@/app/(app)/dashboard/codes/_components/use-organize-action";
import { VERSION_FIELDS } from "@/app/(app)/dashboard/codes/_lib/version-diff";

export function HistoryRestoreButton({
  codeId,
  versionId,
  when,
  undoes,
}: {
  codeId: string;
  versionId: string;
  /** Formatted time of the version */
  when: string;
  /** Labels of the settings the restore changes back */
  undoes: string[];
}) {
  const t = useTranslations("app.dashboard.codes.historyRestoreButton");
  const [open, setOpen] = useState(false);
  const { run, isPending } = useOrganizeAction();

  const restore = async () => {
    const result = await run(
      () => restoreQrCodeVersion({ codeId, versionId }),
      {
        success: ({ restored }) =>
          restored.length > 0 ? "Version restored" : "Nothing to restore",
        description: ({ restored, skipped }) =>
          [
            restored.length > 0 &&
              `Restored: ${restored.map((change) => change.label).join(", ")}.`,
            skipped.length > 0 &&
              `Kept as is: ${skipped.join(", ")} (passwords are never stored in history; some settings need a paid plan or a verified domain).`,
          ]
            .filter(Boolean)
            .join(" ") || null,
      },
    );
    if (result) setOpen(false);
  };

  return (
    <>
      <Button
        disabled={isPending}
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
      >
        <History />
        {t("restore")}
      </Button>
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("restoreTheVersionFromWhen", { when })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {undoes.length > 0 && (
                <>{t("thisChangesBackValue", { value: undoes.join(", ") })} </>
              )}
              {t("laterEditsToTheseSettings")}
              {undoes.includes(VERSION_FIELDS.domainId.label) &&
                t("theShortLinkChangesWith")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button disabled={isPending} onClick={restore}>
              {isPending ? t("restoring") : t("restoreVersion")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
