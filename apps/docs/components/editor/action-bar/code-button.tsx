"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Braces } from "lucide-react";
import { useState } from "react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { QRCodeDialog } from "./qr-code-dialog";

export function CodeButton() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <TooltipWrapper label="View QR code" asChild>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Braces className="h-4 w-4" />
          <span className="hidden text-sm md:block">Code</span>
        </Button>
      </TooltipWrapper>
      <QRCodeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}


