"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Separator } from "@repo/design-system/components/ui/separator";
import { Check, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useUpdateQRTheme } from "@/lib/hooks/use-themes";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";
import type { ThemeEditorState } from "@/types/editor";
import type { ThemeStyles } from "@/types/theme";
import { QRSaveDialog } from "./qr-save-dialog";

interface QREditActionsProps {
  theme: {
    id: string;
    name: string;
  };
  disabled?: boolean;
}

export function QREditActions({ theme, disabled = false }: QREditActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const updateThemeMutation = useUpdateQRTheme();
  const { themeState, applyThemePreset } = useQREditorStore();
  const { updatePreset } = useThemePresetStore();
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);

  const mainEditorUrl = `/playground?${searchParams}`;

  const handleCancel = () => {
    // Keep the current search params for tab persistence
    router.push(mainEditorUrl);
    // Reset to default preset
    if (themeState.preset) {
      applyThemePreset(themeState.preset);
    }
  };

  const handleSaveTheme = async (newName: string) => {
    const dataToUpdate: {
      id: string;
      name?: string;
      styles?: ThemeEditorState["styles"];
    } = {
      id: theme.id,
    };

    if (newName !== theme.name) {
      dataToUpdate.name = newName;
    } else {
      dataToUpdate.name = theme.name;
    }

    if (themeState.styles as ThemeStyles) {
      dataToUpdate.styles = themeState.styles as ThemeStyles;
    }

    if (!dataToUpdate.name && !dataToUpdate.styles) {
      setIsSaveDialogOpen(false);
      return;
    }

    try {
      const result = await updateThemeMutation.mutateAsync(dataToUpdate);
      if (result) {
        // Update the preset in the store with the new data
        const updatedPreset = {
          label: result.name,
          styles: result.style,
          source: "SAVED" as const,
          createdAt: result.createdAt.toISOString(),
        };
        updatePreset(result.id, updatedPreset);

        setIsSaveDialogOpen(false);
        router.push(mainEditorUrl);
        applyThemePreset(result.id);
      }
    } catch (error) {
      console.error("Failed to update theme:", error);
    }
  };

  const handleSaveClick = () => {
    setIsSaveDialogOpen(true);
  };

  return (
    <>
      <div className="bg-card/80 text-card-foreground flex items-center">
        <div className="flex min-h-14 flex-1 items-center gap-2 px-4">
          <div className="flex animate-pulse items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-card-foreground/60 text-sm font-medium">
              Editing
            </span>
          </div>
          <span className="max-w-56 truncate px-2 text-sm font-semibold">
            {theme.name}
          </span>
        </div>

        <Separator orientation="vertical" className="h-8! w-px bg-border" />

        <TooltipWrapper label="Cancel changes" asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-14 shrink-0 rounded-none"
            onClick={handleCancel}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
        </TooltipWrapper>

        <Separator orientation="vertical" className="h-8! w-px bg-border" />

        <TooltipWrapper label="Save changes" asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-14 shrink-0 rounded-none"
            onClick={handleSaveClick}
            disabled={disabled || updateThemeMutation.isPending}
          >
            <Check className="h-4 w-4" />
          </Button>
        </TooltipWrapper>
      </div>

      <QRSaveDialog
        open={isSaveDialogOpen}
        onOpenChange={setIsSaveDialogOpen}
        onSave={handleSaveTheme}
        isSaving={updateThemeMutation.isPending}
        initialThemeName={theme.name}
        title="Save Theme Changes"
        description="Confirm or update the theme name before saving."
        ctaLabel="Save Changes"
      />
    </>
  );
}
