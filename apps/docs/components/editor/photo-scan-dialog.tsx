"use client";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import { DialogCloseButton } from "@/components/editor/dialog-close-button";
import { usePhotoScanDialogStore } from "@/components/editor/photo-scan-dialog-store";
import { ScanChecker } from "@/components/sections/tools/scan-checker";
import { useQREditorStore } from "@/store/editor-store";

/**
 * "Check a photo of the print": the scan checker in a dialog (a drawer on
 * phones), comparing what the photo decodes to with the editor's value. It
 * runs in the browser and uploads nothing. Opened through
 * usePhotoScanDialogStore (the scan score popover, the More menu and a
 * playground link's open=photo-check); mounted once by components/editor.tsx.
 */
export function PhotoScanDialog() {
  const open = usePhotoScanDialogStore((state) => state.open);
  const setOpen = usePhotoScanDialogStore((state) => state.setOpen);

  return (
    <ResponsiveDialog onOpenChange={setOpen} open={open}>
      <ResponsiveDialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-lg dark:!border-border">
        <div className="flex max-h-[inherit] min-h-0 flex-col">
          <ResponsiveDialogHeader className="flex-row items-start gap-3 px-6 pt-1 pb-0 text-left sm:pt-6">
            <div className="min-w-0 flex-1 space-y-1">
              <ResponsiveDialogTitle>
                Check a photo of the print
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                Checked in your browser. The image is never uploaded.
              </ResponsiveDialogDescription>
            </div>
            <DialogCloseButton className="-mt-1 -mr-2 hidden sm:inline-flex" />
          </ResponsiveDialogHeader>

          <div className="min-h-0 overflow-y-auto px-6 pt-4 pb-4">
            <PhotoCheck />
          </div>

          <div className="border-t px-6 py-3">
            {/* Closes first: the store outlives the editor, and a return to
                the playground would otherwise reopen the dialog. */}
            <Link
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
              href="/tools/scan-checker"
              onClick={() => setOpen(false)}
            >
              Full scan checker
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/** The compact checker against what the editor encodes now. */
function PhotoCheck() {
  const value = useQREditorStore((state) => state.value);
  return <ScanChecker compact expected={value} />;
}
