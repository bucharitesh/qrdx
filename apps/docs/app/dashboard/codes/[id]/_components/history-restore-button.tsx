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
import { useState } from "react";
import { restoreQrCodeVersion } from "@/actions/bulk-codes";
import { useOrganizeAction } from "@/app/dashboard/codes/_components/use-organize-action";
import { VERSION_FIELDS } from "@/app/dashboard/codes/_lib/version-diff";

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
        Restore
      </Button>
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore the version from {when}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {undoes.length > 0 && (
                <>This changes back: {undoes.join(", ")}. </>
              )}
              Later edits to these settings are undone too. Your current
              settings are saved in history first, so you can switch back.
              {undoes.includes(VERSION_FIELDS.domainId.label) &&
                " The short link changes with the domain, so download the QR code again afterwards."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <Button disabled={isPending} onClick={restore}>
              {isPending ? "Restoring..." : "Restore version"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
