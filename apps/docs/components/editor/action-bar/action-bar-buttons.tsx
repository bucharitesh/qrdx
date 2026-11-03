"use client";

import { Separator } from "@repo/design-system/components/ui/separator";
import { useMemo } from "react";
import { KeyboardShortcutsButton } from "@/components/keyboard-shortcuts-button";
import { useKeyboardShortcutsModal } from "@/components/keyboard-shortcuts-trigger";
import { useThemesData } from "@/lib/hooks/themes/use-themes-data";
import { useAIQRGenerationCore } from "@/lib/hooks/use-ai-qr-generation-core";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";
import { ThemeToggle } from "../../theme-toggle";
import ContrastChecker from "../contrast-checker";
import { CodeButton } from "./code-button";
import { CopySVGButton } from "./copy-svg-button";
import { DownloadButton } from "./download-button";
import { EditButton } from "./edit-button";
import { PublishButton } from "./publish-button";
import { ResetButton } from "./reset-button";
import { SaveButton } from "./save-button";
import { ShareButton } from "./share-button";
import { UndoRedoButtons } from "./undo-redo-buttons";

interface ActionBarButtonsProps {
  onSaveClick: () => void;
  onShareClick: (id?: string) => void;
  isSaving: boolean;
  codeDialogOpen: boolean;
  setCodeDialogOpen: (open: boolean) => void;
  /**
   * "mobile": Share and Download live in the bottom bar instead, and the
   * keyboard shortcuts button is left out on a touch screen.
   */
  layout?: "desktop" | "mobile";
}

export function ActionBarButtons({
  onSaveClick,
  onShareClick,
  isSaving,
  codeDialogOpen,
  setCodeDialogOpen,
  layout = "desktop",
}: ActionBarButtonsProps) {
  const { themeState, resetToCurrentPreset, hasUnsavedChanges } =
    useQREditorStore();
  const { isGenerating } = useAIQRGenerationCore();
  const { getPreset } = useThemePresetStore();
  const { data: themes } = useThemesData();
  const currentPreset = themeState?.preset
    ? getPreset(themeState?.preset)
    : undefined;
  const isSavedPreset = !!currentPreset && currentPreset.source === "SAVED";
  const desktop = layout === "desktop";

  const { setOpen } = useKeyboardShortcutsModal();

  const isMounted = useMounted();

  const handleReset = () => {
    resetToCurrentPreset();
  };

  const savedTheme = useMemo(() => {
    if (!isSavedPreset || !themes || !themeState.preset) return undefined;
    return themes.find((t) => t.id === themeState.preset);
  }, [isSavedPreset, themes, themeState.preset]);
  const isPublished = savedTheme?.isPublished ?? false;

  // During SSR and initial render, use safe default values to avoid hydration mismatch
  const resetDisabled = !isMounted || !hasUnsavedChanges() || isGenerating;
  const editDisabled = !isMounted || isGenerating;
  const shareDisabled = !isMounted || isGenerating;
  const saveDisabled = !isMounted || isGenerating;
  const contrastDisabled = !isMounted || isGenerating;
  const undoRedoDisabled = !isMounted || isGenerating;

  return (
    <div className="flex w-full items-center justify-between gap-1">
      <div className="flex items-center gap-1">
        <UndoRedoButtons disabled={undoRedoDisabled} />
        <ResetButton onClick={handleReset} disabled={resetDisabled} />
      </div>

      <div className="flex items-center gap-1">
        {desktop && <KeyboardShortcutsButton onClick={() => setOpen(true)} />}
        <ContrastChecker
          currentStyles={themeState.styles}
          disabled={contrastDisabled}
        />
        <Separator
          orientation="vertical"
          className="mx-1 h-8! w-px bg-border"
        />
        <ThemeToggle />
        <Separator
          orientation="vertical"
          className="mx-1 h-8! w-px bg-border"
        />
        {isSavedPreset && (
          <EditButton
            themeId={themeState.preset as string}
            disabled={editDisabled}
          />
        )}
        {desktop && (
          <ShareButton
            onClick={() => onShareClick(themeState.preset)}
            disabled={shareDisabled}
          />
        )}
        {isSavedPreset && !hasUnsavedChanges() ? (
          <PublishButton
            themeId={themeState.preset as string}
            isPublished={isPublished}
            themeName={savedTheme?.name}
            themeStyle={savedTheme?.style}
            disabled={isGenerating}
          />
        ) : (
          <SaveButton
            onClick={onSaveClick}
            isSaving={isSaving}
            disabled={saveDisabled}
          />
        )}
        <CopySVGButton />
        <CodeButton
          dialogOpen={codeDialogOpen}
          setDialogOpen={setCodeDialogOpen}
        />
        {desktop && <DownloadButton className="ml-2" />}
      </div>
    </div>
  );
}
