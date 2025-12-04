"use client";

import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import { useQRDialogActions } from "@/lib/hooks/use-qr-dialog-actions";
import { ActionBarButtons } from "./action-bar/action-bar-buttons";

export function ActionBar() {
  const { handleSaveClick, handleShareClick, isCreatingTheme } =
    useQRDialogActions();

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <HorizontalScrollArea className="flex h-14 w-full items-center justify-between gap-4 px-4">
        <ActionBarButtons
          onSaveClick={() => handleSaveClick()}
          isSaving={isCreatingTheme}
          onShareClick={handleShareClick}
        />
      </HorizontalScrollArea>
    </div>
  );
}
