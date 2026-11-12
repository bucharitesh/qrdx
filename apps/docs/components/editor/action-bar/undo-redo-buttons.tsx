"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Back } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { soundEvent } from "@/lib/sound/emit";
import { useQREditorStore } from "@/store/editor-store";

interface UndoRedoButtonsProps extends React.ComponentProps<typeof Button> {}

export function UndoRedoButtons({
  disabled = false,
  ...props
}: UndoRedoButtonsProps) {
  const t = useTranslations("editor.actionBar.undoRedoButtons");
  const { undo, redo, canUndo, canRedo } = useQREditorStore();

  return (
    <div className="flex items-center gap-1">
      <TooltipWrapper label={t("undo")} asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("undo")}
          disabled={disabled || !canUndo()}
          {...props}
          onClick={() => {
            undo();
            soundEvent("back");
          }}
        >
          <Back className="size-4" />
        </Button>
      </TooltipWrapper>

      <TooltipWrapper label={t("redo")} asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("redo")}
          disabled={disabled || !canRedo()}
          {...props}
          onClick={() => {
            redo();
            soundEvent("forward");
          }}
        >
          <Back className="size-4 -scale-x-100" />
        </Button>
      </TooltipWrapper>
    </div>
  );
}
