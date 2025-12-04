"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { QRSaveDialog } from "@/components/editor/qr-save-dialog";
import { QRShareDialog } from "@/components/editor/qr-share-dialog";
import { authClient } from "@/lib/auth-client";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { useCreateQRTheme } from "@/lib/hooks/use-qr-themes";
import { useAuthStore } from "@/store/auth-store";
import { useQREditorStore } from "@/store/editor-store";
import { useQRPresetStore } from "@/store/qr-preset-store";
import type { QRStyle } from "@/types/qr";
import { getPresetById } from "@/utils/qr-presets";

interface QRDialogActionsContextType {
  // Dialog states
  saveDialogOpen: boolean;
  shareDialogOpen: boolean;
  shareUrl: string;
  isCreatingTheme: boolean;

  // Dialog actions
  setSaveDialogOpen: (open: boolean) => void;
  setShareDialogOpen: (open: boolean) => void;

  // Handler functions
  handleSaveClick: (options?: { shareAfterSave?: boolean }) => void;
  handleShareClick: (id?: string) => Promise<void>;
  saveTheme: (themeName: string) => Promise<void>;
}

function useQRDialogActionsStore(): QRDialogActionsContextType {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [shareAfterSave, setShareAfterSave] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const { style, value, currentPreset, hasChangedFromCheckpoint, applyPreset } =
    useQREditorStore();
  const { getPresetById } = useQRPresetStore();
  const { data: session } = authClient.useSession();
  const { openAuthDialog } = useAuthStore();
  const createThemeMutation = useCreateQRTheme();

  usePostLoginAction("SAVE_THEME", () => {
    setSaveDialogOpen(true);
  });

  usePostLoginAction("SAVE_THEME_FOR_SHARE", () => {
    setSaveDialogOpen(true);
    setShareAfterSave(true);
  });

  const handleSaveClick = (options?: { shareAfterSave?: boolean }) => {
    if (!session) {
      openAuthDialog(
        "signin",
        options?.shareAfterSave ? "SAVE_THEME_FOR_SHARE" : "SAVE_THEME",
      );
      return;
    }

    setSaveDialogOpen(true);
    if (options?.shareAfterSave) {
      setShareAfterSave(true);
    }
  };

  const saveTheme = async (themeName: string) => {
    const themeData = {
      name: themeName,
      styles: style as QRStyle,
    };

    try {
      const theme = await createThemeMutation.mutateAsync(themeData);
      if (!theme) return;

      // Apply the saved theme as current preset
      const savedPreset = {
        id: theme.id,
        name: theme.name,
        description: theme.description || "",
        source: "SAVED" as const,
        createdAt: theme.createdAt.toISOString(),
        style: theme.style,
      };

      applyPreset(savedPreset);

      if (shareAfterSave) {
        await handleShareClick(theme.id);
        setShareAfterSave(false);
      }

      setTimeout(() => {
        setSaveDialogOpen(false);
      }, 50);
    } catch (error) {
      console.error("Save operation failed:", error);
    }
  };

  const handleShareClick = async (id?: string) => {
    if (hasChangedFromCheckpoint()) {
      handleSaveClick({ shareAfterSave: true });
      return;
    }

    const presetId = id ?? currentPreset?.id;

    if (!presetId) {
      setShareUrl(`${window.location.origin}/editor/qr`);
      setShareDialogOpen(true);
      return;
    }

    const preset = getPresetById(presetId);
    const isSavedPreset = currentPreset?.source === "SAVED";

    const url = isSavedPreset
      ? `${window.location.origin}/editor/qr/${presetId}`
      : `${window.location.origin}/editor/qr?preset=${presetId}`;

    setShareUrl(url);
    setShareDialogOpen(true);
  };

  return {
    // Dialog states
    saveDialogOpen,
    shareDialogOpen,
    shareUrl,
    isCreatingTheme: createThemeMutation.isPending,

    // Dialog actions
    setSaveDialogOpen,
    setShareDialogOpen,

    // Handler functions
    handleSaveClick,
    handleShareClick,
    saveTheme,
  };
}

export const QRDialogActionsContext =
  createContext<QRDialogActionsContextType | null>(null);

export function QRDialogActionsProvider({ children }: { children: ReactNode }) {
  const store = useQRDialogActionsStore();

  return (
    <QRDialogActionsContext value={store}>
      {children}

      {/* Global Dialogs */}
      <QRSaveDialog
        open={store.saveDialogOpen}
        onOpenChange={store.setSaveDialogOpen}
        onSave={store.saveTheme}
        isSaving={store.isCreatingTheme}
      />
      <QRShareDialog
        open={store.shareDialogOpen}
        onOpenChange={store.setShareDialogOpen}
        url={store.shareUrl}
      />
    </QRDialogActionsContext>
  );
}

export function useQRDialogActions(): QRDialogActionsContextType {
  const context = useContext(QRDialogActionsContext);

  if (!context) {
    throw new Error(
      "useQRDialogActions must be used within a QRDialogActionsProvider",
    );
  }

  return context;
}
