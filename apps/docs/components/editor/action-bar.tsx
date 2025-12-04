"use client";

import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import { useQRDialogActions } from "@/lib/hooks/use-qr-dialog-actions";
import { ActionBarButtons } from "./action-bar/action-bar-buttons";

export function ActionBar() {
  const { handleSaveClick, handleShareClick, isCreatingTheme } =
    useQRDialogActions();

  return (
    <div className="border-b">
      <HorizontalScrollArea className="flex h-14 w-full items-center justify-end gap-4 px-4">
        <ActionBarButtons
          onSaveClick={() => handleSaveClick()}
          isSaving={isCreatingTheme}
          onShareClick={handleShareClick}
        />
      </HorizontalScrollArea>
    </div>
  );
}
