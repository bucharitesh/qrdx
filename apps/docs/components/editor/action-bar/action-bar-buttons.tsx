import { Separator } from "@repo/design-system/components/ui/separator";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useQREditorStore } from "@/store/editor-store";
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
  const pathname = usePathname();
  const { resetToPreset, hasUnsavedChanges, currentPreset } =
    useQREditorStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleReset = () => {
    resetToPreset();
  };

  const isSavedTheme = currentPreset?.source === "SAVED";
  // Check if we're currently editing (URL contains the theme ID)
  const isEditing = currentPreset?.id && pathname.includes(currentPreset.id);

  // Only check unsaved changes after mount to avoid hydration mismatch
  const hasChanges = mounted ? hasUnsavedChanges() : false;

  return (
    <>
      {/* Left side - Undo/Redo */}
      <div className="flex items-center gap-1">
        <UndoRedoButtons />
      </div>

      {/* Right side - Other buttons */}
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Separator
          orientation="vertical"
          className="mx-1 h-8 bg-border/60 dark:bg-border/40"
        />
        <ResetButton onClick={handleReset} disabled={!hasChanges} />
        <Separator
          orientation="vertical"
          className="mx-1 h-8 bg-border/60 dark:bg-border/40"
        />
        {isSavedTheme && currentPreset?.id && !isEditing && (
          <EditButton themeId={currentPreset.id} />
        )}
        <ShareButton onClick={() => onShareClick(currentPreset?.id)} />
        {!isEditing && <SaveButton onClick={onSaveClick} isSaving={isSaving} />}
        <Separator
          orientation="vertical"
          className="mx-1 h-8 bg-border/60 dark:bg-border/40"
        />
        <DownloadButton />
        <CopySVGButton />
      </div>
    </>
  );
}
