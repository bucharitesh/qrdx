"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Separator } from "@repo/design-system/components/ui/separator";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useUpdateQRTheme } from "@/lib/hooks/use-qr-themes";
import { useQREditorStore } from "@/store/editor-store";
import { Check, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
  const { style, currentPreset, applyPreset } = useQREditorStore();
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);

  const mainEditorUrl = `/editor/qr?${searchParams}`;

  const handleCancel = () => {
    // Keep the current search params for tab persistence
    router.push(mainEditorUrl);
    // Reset to default preset
    if (currentPreset) {
      applyPreset(currentPreset);
    }
  };

  const handleSaveTheme = async (newName: string) => {
    const dataToUpdate: {
      id: string;
      name?: string;
      styles?: typeof style;
    } = {
      id: theme.id,
    };

    if (newName !== theme.name) {
      dataToUpdate.name = newName;
    } else {
      dataToUpdate.name = theme.name;
    }

    if (style) {
      dataToUpdate.styles = style;
    }

    if (!dataToUpdate.name && !dataToUpdate.styles) {
      setIsSaveDialogOpen(false);
      return;
    }

    try {
      const result = await updateThemeMutation.mutateAsync(dataToUpdate);
      if (result) {
        setIsSaveDialogOpen(false);
        router.push(mainEditorUrl);
        // Apply the updated theme
        const updatedPreset = {
          id: result.id,
          name: result.name,
          description: result.description || "",
          source: "SAVED" as const,
          createdAt: result.createdAt.toISOString(),
          style: result.style,
        };
        applyPreset(updatedPreset);
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
            <span className="text-card-foreground/60 text-sm font-medium">Editing</span>
          </div>
          <span className="max-w-56 truncate px-2 text-sm font-semibold">{theme.name}</span>
        </div>

        <Separator orientation="vertical" className="bg-border h-8" />

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

        <Separator orientation="vertical" className="bg-border h-8" />

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



