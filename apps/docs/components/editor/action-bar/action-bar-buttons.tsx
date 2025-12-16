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

interface ActionBarButtonsProps {
  onSaveClick: () => void;
  onShareClick: (id?: string) => void;
  isSaving: boolean;
}

export function ActionBarButtons({
  onSaveClick,
  onShareClick,
  isSaving,
}: ActionBarButtonsProps) {
  const { themeState, resetToCurrentPreset, hasUnsavedChanges } =
    useQREditorStore();
  const { isGenerating } = useAIQRGenerationCore();
  const { getPreset } = useThemePresetStore();
  const currentPreset = themeState?.preset
    ? getPreset(themeState?.preset)
    : undefined;
  const isSavedPreset = !!currentPreset && currentPreset.source === "SAVED";

  const handleReset = () => {
    resetToCurrentPreset();
  };

  return (
    <div className="w-full flex items-center justify-between gap-1">
      <div className="flex items-center gap-1">
        <UndoRedoButtons disabled={isGenerating} />
        <ResetButton
          onClick={handleReset}
          disabled={!hasUnsavedChanges() || isGenerating}
        />
      </div>

      <div className="flex items-center gap-1">
        <ContrastChecker
          currentStyles={themeState.styles}
          disabled={isGenerating}
        />
        <Separator orientation="vertical" className="mx-1 !h-8 w-px bg-border" />
        <ThemeToggle />
        <Separator orientation="vertical" className="mx-1 !h-8 w-px bg-border" />
        {isSavedPreset && (
          <EditButton
            themeId={themeState.preset as string}
            disabled={isGenerating}
          />
        )}
        <ShareButton
          onClick={() => onShareClick(themeState.preset)}
          disabled={isGenerating}
        />
        <SaveButton
          onClick={onSaveClick}
          isSaving={isSaving}
          disabled={isGenerating}
        />
        <CopySVGButton />
        <DownloadButton />
        <CodeButton />
      </div>
    </div>
  );
}
