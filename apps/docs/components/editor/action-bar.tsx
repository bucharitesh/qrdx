"use client";

import { useState } from "react";
import { ActionBarButtons } from "@/components/editor/action-bar/action-bar-buttons";
import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import {
  QRDialogActionsProvider,
  useQRDialogActions,
} from "@/lib/hooks/use-dialog-actions";
import { usePlaygroundShortcuts } from "@/lib/hooks/use-playground-shortcuts";
import { useQREditorStore } from "@/store/editor-store";

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
  const { resetToCurrentPreset } = useQREditorStore();
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);

  // Initialize keyboard shortcuts
  usePlaygroundShortcuts({
    onSave: () => handleSaveClick(),
    onShare: () => handleShareClick(),
    onDownload: () => setDownloadDialogOpen(true),
    onCode: () => setCodeDialogOpen(true),
    onReset: () => resetToCurrentPreset(),
  });

  return (
    <div className="border-b">
      <HorizontalScrollArea className="flex h-14 w-full items-center justify-end gap-4 px-4">
        <ActionBarButtons
          onSaveClick={() => handleSaveClick()}
          isSaving={isCreatingTheme}
          onShareClick={handleShareClick}
          downloadDialogOpen={downloadDialogOpen}
          setDownloadDialogOpen={setDownloadDialogOpen}
          codeDialogOpen={codeDialogOpen}
          setCodeDialogOpen={setCodeDialogOpen}
        />
      </HorizontalScrollArea>
    </div>
  );
}
