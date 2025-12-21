"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Braces } from "lucide-react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { QRCodeDialog } from "./qr-code-dialog";

interface CodeButtonProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
}

export function CodeButton({ dialogOpen, setDialogOpen }: CodeButtonProps) {
  return (
    <>
      <TooltipWrapper label="View QR code" kbd="V" asChild>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Braces className="h-4 w-4" />
          <span className="hidden text-sm md:block sr-only">Code</span>
        </Button>
      </TooltipWrapper>
      <QRCodeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
