"use client";

import { ActionBarButtons } from "@/components/editor/action-bar/action-bar-buttons";
import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import {
  QRDialogActionsProvider,
  useQRDialogActions,
} from "@/lib/hooks/use-qr-dialog-actions";

export function ActionBar() {
  return (
    <QRDialogActionsProvider>
      <ActionBarContent />
    </QRDialogActionsProvider>
  );
}

function ActionBarContent() {
  const { isCreatingTheme, handleSaveClick, handleShareClick } =
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
