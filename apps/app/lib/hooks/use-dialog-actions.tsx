import { track } from "@repo/analytics";
import { authClient } from "@repo/auth/client";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useContext, useState } from "react";
// import { QRCodeDialog } from "@/components/editor/qr";
import { QRSaveDialog } from "@/components/editor/qr-save-dialog";
import { QRShareDialog } from "@/components/editor/qr-share-dialog";
import { loadFrameIndex } from "@/lib/frames/library";
import {
  useCreateTheme,
  useUpdateTheme,
} from "@/lib/hooks/themes/use-theme-mutations";
import { useAIQRGenerationCore } from "@/lib/hooks/use-ai-qr-generation-core";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { playgroundHref } from "@/lib/playground-links";
import { encodeStyleParam, type OmittedPart } from "@/lib/playground-style";
import { soundEvent } from "@/lib/sound/emit";
import { isShuffleId } from "@/lib/themes/shuffle";
import { useAuthStore } from "@/store/auth-store";
import { useQREditorStore } from "@/store/editor-store";
import { useThemePresetStore } from "@/store/theme-preset-store";

type PendingAction = "share" | null;

// Get contextual copy for the save dialog based on the pending action
function getSaveDialogCopy(
  pendingAction: PendingAction,
  t: ReturnType<typeof useTranslations<"editor.hooks.useDialogActions">>,
) {
  switch (pendingAction) {
    case "share":
      return {
        title: t("saveToShare.title"),
        description: t("saveToShare.description"),
        ctaLabel: t("saveToShare.ctaLabel"),
      };
    default:
      return {};
  }
}

interface DialogActionsContextType {
  codePanelOpen: boolean;
  saveDialogOpen: boolean;
  shareDialogOpen: boolean;
  shareUrl: string;
  /** The share link carries the style itself (no saved theme behind it) */
  shareIsStyleLink: boolean;
  /** What a style link leaves out of the design */
  shareOmitted: OmittedPart[];
  dialogKey: number;
  isCreatingTheme: boolean;
  isUpdatingTheme: boolean;
  isGeneratingTheme: boolean;
  pendingAction: PendingAction;
  existingThemeName: string | undefined;

  // Dialog actions
  setCssImportOpen: (open: boolean) => void;
  setCodePanelOpen: (open: boolean) => void;
  setSaveDialogOpen: (open: boolean) => void;
  setShareDialogOpen: (open: boolean) => void;

  handleSaveClick: (options?: { shareAfterSave?: boolean }) => void;
  handleShareClick: (id?: string) => Promise<void>;
  saveTheme: (themeName: string) => Promise<void>;
  handleUpdateExisting: () => Promise<void>;
}

function useDialogActionsStore(): DialogActionsContextType {
  const [cssImportOpen, setCssImportOpen] = useState(false);
  const [codePanelOpen, setCodePanelOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareIsStyleLink, setShareIsStyleLink] = useState(false);
  const [shareOmitted, setShareOmitted] = useState<OmittedPart[]>([]);
  const [dialogKey, _setDialogKey] = useState(0);

  const {
    themeState,
    applyThemePreset,
    hasThemeChangedFromCheckpoint,
    hasUnsavedChanges,
  } = useQREditorStore();
  const { getPreset } = useThemePresetStore();
  const { data: session } = authClient.useSession();
  const { openAuthDialog } = useAuthStore();
  const createThemeMutation = useCreateTheme();
  const updateThemeMutation = useUpdateTheme();
  const { isGenerating } = useAIQRGenerationCore();

  const currentPreset = themeState?.preset
    ? getPreset(themeState.preset)
    : undefined;
  // Team members can't overwrite team themes (owners/admins manage them).
  const isOnSavedPreset =
    !!currentPreset &&
    currentPreset.source === "SAVED" &&
    currentPreset.canEdit !== false &&
    hasUnsavedChanges();
  const existingThemeName = isOnSavedPreset ? currentPreset.label : undefined;

  usePostLoginAction("SAVE_THEME", () => {
    setSaveDialogOpen(true);
  });

  usePostLoginAction("SAVE_THEME_FOR_SHARE", () => {
    setSaveDialogOpen(true);
    setPendingAction("share");
  });

  const handleSaveClick = (options?: { shareAfterSave?: boolean }) => {
    if (!session) {
      let action: "SAVE_THEME" | "SAVE_THEME_FOR_SHARE" = "SAVE_THEME";
      if (options?.shareAfterSave) action = "SAVE_THEME_FOR_SHARE";
      openAuthDialog("signin", action);
      return;
    }

    setSaveDialogOpen(true);
    if (options?.shareAfterSave) {
      setPendingAction("share");
    }
  };

  const saveTheme = async (themeName: string) => {
    const themeData = {
      name: themeName,
      style: themeState.styles,
    };

    try {
      const theme = await createThemeMutation.mutateAsync(themeData);
      track("theme_saved");
      if (!theme) return;
      applyThemePreset(theme?.id || themeState.preset || "default");
      soundEvent("success");
      if (pendingAction === "share") {
        handleShareClick(theme?.id);
        setPendingAction(null);
      } else if (pendingAction === "v0") {
        openInV0(theme?.id);
        setPendingAction(null);
      }
      setTimeout(() => {
        setSaveDialogOpen(false);
      }, 50);
    } catch (error) {
      console.error(
        "Save operation failed (error likely handled by hook):",
        error,
      );
    }
  };

  /**
   * `id`: a theme saved just now (the preset store may not list it yet).
   * Otherwise a stored theme that is unchanged shares as /playground/<id>:
   * one of the user's saved themes, or a theme the page was opened with
   * (/playground/<id>, not in the store). Anything else, built-in presets
   * included (they have no /playground/<id> page), shares its style.
   */
  const handleShareClick = async (id?: string) => {
    const presetId = id ?? themeState.preset;
    const currentPreset = presetId ? getPreset(presetId) : undefined;
    const isSavedPreset = currentPreset?.source === "SAVED";
    const isLinkedTheme =
      !currentPreset &&
      !!presetId &&
      presetId !== "default" &&
      !isShuffleId(presetId);
    const unchanged = id
      ? true
      : isSavedPreset
        ? !hasUnsavedChanges()
        : isLinkedTheme && !hasThemeChangedFromCheckpoint();

    if (presetId && (isSavedPreset || isLinkedTheme) && unchanged) {
      track("theme_shared", { saved: true });
      setShareUrl(
        new URL(
          playgroundHref({ themeId: presetId }),
          window.location.origin,
        ).toString(),
      );
      setShareIsStyleLink(false);
      setShareOmitted([]);
      setShareDialogOpen(true);
      return;
    }

    // Anything else shares its style in the link, signed in or not. Logos
    // and art never go in a link (lib/playground-style.ts).
    const builtInPreset =
      presetId &&
      currentPreset &&
      currentPreset.source !== "SAVED" &&
      !isShuffleId(presetId)
        ? presetId
        : undefined;
    // An official frame travels by id: its id comes from the frame
    // library's index, so load that first (one small chunk).
    if (themeState.styles.frame?.style === "custom") {
      await loadFrameIndex().catch(() => {
        // Offline: the frame's spec travels in the link instead
      });
    }
    const encoded = encodeStyleParam(themeState.styles, {
      preset: builtInPreset,
    });
    if (!encoded) {
      handleSaveClick({ shareAfterSave: true });
      return;
    }

    track("theme_shared", { saved: false });
    setShareUrl(
      new URL(
        playgroundHref({ style: encoded.value }),
        window.location.origin,
      ).toString(),
    );
    setShareIsStyleLink(true);
    setShareOmitted(encoded.omitted);
    setShareDialogOpen(true);
  };

  // Internal helper to open v0 with a theme
  const openInV0 = (id?: string, name?: string) => {
    const presetId = id ?? themeState.preset;
    if (!presetId) return;

    const currentPreset = getPreset(presetId);
    // If an explicit ID is passed but not found in presets, treat as a saved/database theme
    const isSavedPreset = id
      ? true
      : !!currentPreset && currentPreset.source === "SAVED";
    const themeName = name || currentPreset?.label || presetId;

    track("v0_opened", { saved: isSavedPreset });

    const themeUrl = isSavedPreset
      ? `https://tweakcn.com/r/v0/${presetId}`
      : `https://tweakcn.com/r/v0/${presetId}.json`;
    const title = `"${themeName}" from tweakcn`.slice(0, 32);
    const v0Url = `https://v0.dev/chat/api/open?url=${encodeURIComponent(themeUrl)}&title=${encodeURIComponent(title)}`;
    window.open(v0Url, "_blank", "noopener,noreferrer");
  };

  const handleOpenInV0 = (id?: string, name?: string) => {
    if (id) {
      openInV0(id, name);
      return;
    }

    if (hasThemeChangedFromCheckpoint()) {
      handleSaveClick();
      return;
    }

    openInV0();
  };

  const handleUpdateExisting = async () => {
    if (!themeState.preset) return;
    try {
      const result = await updateThemeMutation.mutateAsync({
        id: themeState.preset,
        styles: themeState.styles,
      });
      if (result) {
        applyThemePreset(result.id || themeState.preset);
        soundEvent("apply");
        setSaveDialogOpen(false);
      }
    } catch (error) {
      console.error("Failed to update theme:", error);
    }
  };

  const value = {
    // Dialog states
    cssImportOpen,
    codePanelOpen,
    saveDialogOpen,
    shareDialogOpen,
    shareUrl,
    shareIsStyleLink,
    shareOmitted,
    dialogKey,
    isCreatingTheme: createThemeMutation.isPending,
    isUpdatingTheme: updateThemeMutation.isPending,
    isGeneratingTheme: isGenerating,
    pendingAction,
    existingThemeName,

    // Dialog actions
    setCssImportOpen,
    setCodePanelOpen,
    setSaveDialogOpen,
    setShareDialogOpen,
    handleSaveClick,
    handleShareClick,
    handleOpenInV0,
    saveTheme,
    handleUpdateExisting,
  };

  return value;
}

export const DialogActionsContext =
  createContext<DialogActionsContextType | null>(null);

export function DialogActionsProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("editor.hooks.useDialogActions");
  const store = useDialogActionsStore();

  return (
    <DialogActionsContext value={store}>
      {children}

      {/* <QRCodeDialog
        open={store.codePanelOpen}
        onOpenChange={store.setCodePanelOpen}
        themeEditorState={themeState}
      /> */}
      <QRSaveDialog
        open={store.saveDialogOpen}
        onOpenChange={store.setSaveDialogOpen}
        onSave={store.saveTheme}
        isSaving={store.isCreatingTheme}
        existingThemeName={store.existingThemeName}
        onUpdateExisting={store.handleUpdateExisting}
        isUpdating={store.isUpdatingTheme}
        {...getSaveDialogCopy(store.pendingAction, t)}
      />
      <QRShareDialog
        omitted={store.shareOmitted}
        onOpenChange={store.setShareDialogOpen}
        onSaveAsTheme={
          store.shareIsStyleLink
            ? () => {
                store.setShareDialogOpen(false);
                store.handleSaveClick({ shareAfterSave: true });
              }
            : undefined
        }
        open={store.shareDialogOpen}
        url={store.shareUrl}
      />
    </DialogActionsContext>
  );
}

export function useDialogActions(): DialogActionsContextType {
  const context = useContext(DialogActionsContext);

  if (!context) {
    throw new Error(
      "useDialogActions must be used within a DialogActionsProvider",
    );
  }

  return context;
}
