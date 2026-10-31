"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Import } from "iconsax-reactjs";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { DownloadDialog } from "./download-dialog";

interface DownloadButtonProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
}

export function DownloadButton({
  dialogOpen,
  setDialogOpen,
}: DownloadButtonProps) {
  return (
    <>
      <TooltipWrapper label="Download QR code" kbd="D" asChild>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Import className="size-4" />
          <span className="hidden text-sm md:block sr-only">Download</span>
        </Button>
      </TooltipWrapper>
      <DownloadDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
