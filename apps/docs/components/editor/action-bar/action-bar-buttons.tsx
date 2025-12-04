import { Separator } from "@repo/design-system/components/ui/separator";
import { useQREditorStore } from "@/store/editor-store";
import { EditButton } from "./edit-button";
import { ResetButton } from "./reset-button";
import { SaveButton } from "./save-button";
import { ShareButton } from "./share-button";
import { ThemeToggle } from "@/components/theme-toggle";
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
  const { resetToPreset, hasUnsavedChanges, currentPreset } = useQREditorStore();

  const handleReset = () => {
    resetToPreset();
  };

  const isSavedTheme = currentPreset?.source === "SAVED";

  return (
    <div className="flex items-center gap-1">
      <ThemeToggle />
      <Separator orientation="vertical" className="mx-1 h-8" />
      <UndoRedoButtons />
      <Separator orientation="vertical" className="mx-1 h-8" />
      <ResetButton onClick={handleReset} disabled={!hasUnsavedChanges()} />
      <Separator orientation="vertical" className="mx-1 h-8" />
      {isSavedTheme && currentPreset?.id && (
        <EditButton themeId={currentPreset.id} />
      )}
      <ShareButton onClick={() => onShareClick(currentPreset?.id)} />
      <SaveButton onClick={onSaveClick} isSaving={isSaving} />
    </div>
  );
}

