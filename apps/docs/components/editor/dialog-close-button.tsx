"use client";

import { Close } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { ResponsiveDialogClose } from "@repo/design-system/components/ui/revola";
import { cn } from "@repo/design-system/lib/utils";

/** Round ghost close (×) button for the editor's responsive dialogs. */
export function DialogCloseButton({ className }: { className?: string }) {
  return (
    <ResponsiveDialogClose asChild>
      <Button
        aria-label="Close"
        className={cn("text-muted-foreground hover:text-foreground", className)}
        size="icon-sm"
        variant="ghost"
      >
        <Close className="size-5" />
      </Button>
    </ResponsiveDialogClose>
  );
}
