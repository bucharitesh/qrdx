"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Download } from "lucide-react";
import { useState } from "react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { DownloadDialog } from "./download-dialog";

export function DownloadButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <TooltipWrapper label="Download QR code" asChild>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Download className="h-4 w-4" />
          <span className="hidden text-sm md:block">Download</span>
        </Button>
      </TooltipWrapper>
      <DownloadDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
