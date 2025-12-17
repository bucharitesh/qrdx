"use client";

import { Separator } from "@repo/design-system/components/ui/separator";
import { useAIQRGenerationCore } from "@/lib/hooks/use-ai-qr-generation-core";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";
import { ThemeToggle } from "../../theme-toggle";
import ContrastChecker from "../contrast-checker";
import { CodeButton } from "./code-button";
import { CopySVGButton } from "./copy-svg-button";
import { DownloadButton } from "./download-button";
import { EditButton } from "./edit-button";
import { ResetButton } from "./reset-button";
import { SaveButton } from "./save-button";
import { ShareButton } from "./share-button";
import { UndoRedoButtons } from "./undo-redo-buttons";
import { KeyboardShortcutsButton } from "@/components/keyboard-shortcuts-button";
import { useKeyboardShortcutsModal } from "@/components/keyboard-shortcuts-trigger";
import { useEffect, useState } from "react";

interface ActionBarButtonsProps {
  onSaveClick: () => void;
  onShareClick: (id?: string) => void;
  isSaving: boolean;
  downloadDialogOpen: boolean;
  setDownloadDialogOpen: (open: boolean) => void;
  codeDialogOpen: boolean;
  setCodeDialogOpen: (open: boolean) => void;
}

export function ActionBarButtons({
  onSaveClick,
  onShareClick,
  isSaving,
  downloadDialogOpen,
  setDownloadDialogOpen,
  codeDialogOpen,
  setCodeDialogOpen,
}: ActionBarButtonsProps) {
  const { themeState, resetToCurrentPreset, hasUnsavedChanges } =
    useQREditorStore();
  const { isGenerating } = useAIQRGenerationCore();
  const { getPreset } = useThemePresetStore();
  const currentPreset = themeState?.preset
    ? getPreset(themeState?.preset)
    : undefined;
  const isSavedPreset = !!currentPreset && currentPreset.source === "SAVED";

  const { setOpen } = useKeyboardShortcutsModal();

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleReset = () => {
    resetToCurrentPreset();
  };

  // During SSR and initial render, use safe default values to avoid hydration mismatch
  const resetDisabled = !isClient || !hasUnsavedChanges() || isGenerating;
  const editDisabled = !isClient || isGenerating;
  const shareDisabled = !isClient || isGenerating;
  const saveDisabled = !isClient || isGenerating;
  const contrastDisabled = !isClient || isGenerating;
  const undoRedoDisabled = !isClient || isGenerating;

  return (
    <div className="w-full flex items-center justify-between gap-1">
      <div className="flex items-center gap-1">
        <UndoRedoButtons disabled={undoRedoDisabled} />
        <ResetButton
          onClick={handleReset}
          disabled={resetDisabled}
        />
      </div>

      <div className="flex items-center gap-1">
      <KeyboardShortcutsButton onClick={() => setOpen(true)} />
        <ContrastChecker
          currentStyles={themeState.styles}
          disabled={contrastDisabled}
        />
        <Separator orientation="vertical" className="mx-1 !h-8 w-px bg-border" />
        <ThemeToggle />
        <Separator orientation="vertical" className="mx-1 !h-8 w-px bg-border" />
        {isSavedPreset && (
          <EditButton
            themeId={themeState.preset as string}
            disabled={editDisabled}
          />
        )}
        <ShareButton
          onClick={() => onShareClick(themeState.preset)}
          disabled={shareDisabled}
        />
        <SaveButton
          onClick={onSaveClick}
          isSaving={isSaving}
          disabled={saveDisabled}
        />
        <CopySVGButton />
        <DownloadButton
          dialogOpen={downloadDialogOpen}
          setDialogOpen={setDownloadDialogOpen}
        />
        <CodeButton dialogOpen={codeDialogOpen} setDialogOpen={setCodeDialogOpen} />
      </div>
    </div>
  );
}
