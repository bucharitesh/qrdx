"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Icons } from "@/components/icons";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useQREditorStore } from "@/store/editor-store";

interface UndoRedoButtonsProps extends React.ComponentProps<typeof Button> {}

export function UndoRedoButtons({
  disabled = false,
  ...props
}: UndoRedoButtonsProps) {
  const { undo, redo, canUndo, canRedo } = useQREditorStore();

  return (
    <div className="flex items-center gap-1">
      <TooltipWrapper label="Undo" asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || !canUndo()}
          {...props}
          onClick={undo}
        >
          <Icons.Undo className="h-4 w-4" />
        </Button>
      </TooltipWrapper>

      <TooltipWrapper label="Redo" asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || !canRedo()}
          {...props}
          onClick={redo}
        >
          <Icons.Redo className="h-4 w-4" />
        </Button>
      </TooltipWrapper>
    </div>
  );
}
