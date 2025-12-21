"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Keyboard } from "lucide-react";
import { TooltipWrapper } from "./tooltip-wrapper";

interface KeyboardShortcutsButtonProps
  extends React.ComponentProps<typeof Button> {
  onClick?: () => void;
}

export function KeyboardShortcutsButton({
  className,
  onClick,
  ...props
}: KeyboardShortcutsButtonProps) {
  return (
    <TooltipWrapper label="Keyboard shortcuts" kbd="?" asChild>
      <Button
        variant="ghost"
        size="icon"
        className={cn("cursor-pointer", className)}
        onClick={onClick}
        {...props}
      >
        <Keyboard className="h-4 w-4" />
      </Button>
    </TooltipWrapper>
  );
}
