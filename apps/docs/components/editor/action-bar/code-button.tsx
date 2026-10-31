"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Code } from "iconsax-reactjs";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { QRCodeDialog } from "./qr-code-dialog";

interface CodeButtonProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
}

export function CodeButton({ dialogOpen, setDialogOpen }: CodeButtonProps) {
  return (
    <>
      <TooltipWrapper label="Get React code" kbd="V" asChild>
        <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
          <Code className="size-4" />
          <span className="hidden text-sm md:block sr-only">Code</span>
        </Button>
      </TooltipWrapper>
      <QRCodeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
