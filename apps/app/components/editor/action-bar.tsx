"use client";

import { ActionBarButtons } from "@/components/editor/action-bar/action-bar-buttons";
import { useCodeDialogStore } from "@/components/editor/action-bar/code-dialog-store";
import { DownloadButton } from "@/components/editor/action-bar/download-button";
import { DownloadDialog } from "@/components/editor/action-bar/download-dialog";
import { useDownloadDialogStore } from "@/components/editor/action-bar/download-dialog-store";
import { MoreMenu } from "@/components/editor/action-bar/more-menu";
import { ShareButton } from "@/components/editor/action-bar/share-button";
import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import { useAIQRGenerationCore } from "@/lib/hooks/use-ai-qr-generation-core";
import { useDialogActions } from "@/lib/hooks/use-dialog-actions";
import { usePlaygroundShortcuts } from "@/lib/hooks/use-playground-shortcuts";
import { useQREditorStore } from "@/store/editor-store";

interface ActionBarProps {
  /** On phones Share and Download move to the bottom bar (MobileActionBar). */
  layout?: "desktop" | "mobile";
}

/**
 * The toolbar above the preview. Needs the editor's DialogActionsProvider, so
 * it shares the save and share dialogs with the phone's bottom bar.
 */
export function ActionBar({ layout = "desktop" }: ActionBarProps) {
  const { isCreatingTheme, handleSaveClick, handleShareClick } =
    useDialogActions();
  const { resetToCurrentPreset } = useQREditorStore();
  const downloadOpen = useDownloadDialogStore((state) => state.open);
  const setDownloadOpen = useDownloadDialogStore((state) => state.setOpen);
  const codeDialogOpen = useCodeDialogStore((state) => state.open);
  const setCodeDialogOpen = useCodeDialogStore((state) => state.setOpen);

  usePlaygroundShortcuts({
    onSave: () => handleSaveClick(),
    onShare: () => handleShareClick(),
    // Nothing to download while the preview is a sample.
    onDownload: () => {
      if (useQREditorStore.getState().value.trim()) setDownloadOpen(true);
    },
    onCode: () => setCodeDialogOpen(true),
    onReset: () => resetToCurrentPreset(),
  });

  const buttons = (
    <HorizontalScrollArea className="flex h-14 w-full items-center justify-end gap-4 px-4">
      <ActionBarButtons
        onSaveClick={() => handleSaveClick()}
        isSaving={isCreatingTheme}
        onShareClick={handleShareClick}
        codeDialogOpen={codeDialogOpen}
        setCodeDialogOpen={setCodeDialogOpen}
        layout={layout}
      />
    </HorizontalScrollArea>
  );

  return (
    <div className="border-b">
      {layout === "mobile" ? (
        // A phone's row scrolls sideways; More stays in reach at its end and
        // opens as a bottom drawer.
        <div className="flex items-center">
          <div className="min-w-0 flex-1">{buttons}</div>
          <div className="flex h-14 shrink-0 items-center gap-1 pr-3">
            <span aria-hidden className="bg-border h-8 w-px" />
            <MoreMenu layout="mobile" />
          </div>
        </div>
      ) : (
        buttons
      )}
      <DownloadDialog open={downloadOpen} onOpenChange={setDownloadOpen} />
    </div>
  );
}

/** The phone's sticky bottom bar: Share, and Download as the main action. */
export function MobileActionBar() {
  const { handleShareClick } = useDialogActions();
  const { isGenerating } = useAIQRGenerationCore();

  return (
    <div className="bg-background flex shrink-0 items-center gap-2 border-t px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
      <ShareButton
        className="h-10 px-4"
        disabled={isGenerating}
        labelled
        onClick={() => handleShareClick()}
        variant="outline"
      />
      <DownloadButton className="h-10 flex-1" tooltip={false} />
    </div>
  );
}
