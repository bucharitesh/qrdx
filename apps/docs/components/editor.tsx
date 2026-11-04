/** biome-ignore-all lint/correctness/useExhaustiveDependencies: false positive */
"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@repo/design-system/components/ui/resizable";
import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { cn } from "@repo/design-system/lib/utils";
import React, { use, useEffect } from "react";
import { useTrackQrGenerated } from "@/lib/analytics/react";
import { DialogActionsProvider } from "@/lib/hooks/use-dialog-actions";
import { useMounted } from "@/lib/hooks/use-mounted";
import { usePlaygroundParams } from "@/lib/hooks/use-playground-params";
import { useQREditorStore } from "@/store/editor-store";
import type { Theme, ThemeStyles } from "@/types/theme";
import { ActionBar, MobileActionBar } from "./editor/action-bar";
import { AIWorkingGlow } from "./editor/ai/ai-working-glow";
import { CommunitySheet } from "./editor/community-sheet";
import { useCommunitySheetStore } from "./editor/community-sheet-store";
import { PhotoScanDialog } from "./editor/photo-scan-dialog";
import ThemeControlPanel from "./qr-control-panel";
import QRPreviewPanel from "./qr-preview-panel";

// Exported so components/lazy-editor.tsx's inferred type can name it (TS4023).
export interface EditorProps {
  themePromise: Promise<Theme | null>;
}

/**
 * The sample code the preview shows until there's content: the default
 * style encoding https://qrdx.dev, drawn with qrdx's QRCodeSVG. An <img>, so
 * the server-rendered shell paints a real image early (the page's largest
 * paint) instead of waiting for the editor to hydrate.
 */
const SAMPLE_QR_SRC = "/images/editor/sample-qr.svg";

/**
 * Static placeholder in the editor's layout (toolbar, preview, controls),
 * shown until hydration.
 */
function EditorShell() {
  return (
    <div
      aria-busy="true"
      className="relative isolate flex flex-1 flex-col overflow-hidden md:flex-row"
    >
      <div className="order-2 flex min-h-0 flex-1 flex-col gap-3 border-t p-4 md:order-1 md:w-[30%] md:min-w-[22rem] md:flex-none md:border-t-0 md:border-r">
        <div className="bg-muted/60 h-10 animate-pulse rounded-full" />
        <div className="bg-muted/40 h-16 animate-pulse rounded-xl" />
        <div className="bg-muted/40 h-9 animate-pulse rounded-md" />
        <div className="bg-muted/30 hidden h-40 animate-pulse rounded-xl md:block" />
      </div>
      <div className="order-1 flex shrink-0 flex-col md:order-2 md:min-w-0 md:flex-1">
        <div className="h-14 shrink-0 border-b" />
        {/* The preview's padding (p-4 plus px-8 py-10 md:py-12), so the
            sample sits where the live preview draws it. */}
        <div className="flex h-[32svh] min-h-52 items-center justify-center px-12 py-14 md:h-auto md:flex-1 md:py-16">
          <img
            alt=""
            className="aspect-square h-full max-w-full object-contain opacity-40"
            decoding="async"
            fetchPriority="high"
            height={512}
            src={SAMPLE_QR_SRC}
            width={512}
          />
        </div>
      </div>
      <span className="sr-only">Loading the editor…</span>
    </div>
  );
}

/**
 * Surfaces over the editor that open from several places (their stores):
 * the photo check and the community sheet.
 */
function EditorOverlays() {
  return (
    <>
      <PhotoScanDialog />
      <CommunitySheet />
    </>
  );
}

/** qr_generated, in its own component so typing doesn't re-render the editor. */
function TrackQrGenerated() {
  const value = useQREditorStore((state) => state.value);
  const contentType = useQREditorStore((state) => state.contentType);
  useTrackQrGenerated("playground", contentType, value);
  return null;
}

const Editor: React.FC<EditorProps> = ({ themePromise }) => {
  const isMobile = useIsMobile();
  const communityOpen = useCommunitySheetStore((state) => state.open);
  const isMounted = useMounted();

  const themeState = useQREditorStore((state) => state.themeState);
  const setThemeState = useQREditorStore((state) => state.setThemeState);

  const initialQRPreset = themePromise ? use(themePromise) : null;

  const handleStyleChange = React.useCallback(
    (newStyles: Partial<ThemeStyles>) => {
      const prev = useQREditorStore.getState().themeState;
      setThemeState({ ...prev, styles: newStyles });
    },
    [setThemeState],
  );

  useEffect(() => {
    if (initialQRPreset) {
      const prev = useQREditorStore.getState().themeState;
      setThemeState({
        ...prev,
        styles: initialQRPreset.style,
        preset: initialQRPreset.id,
      });
      // The look the page opened with: Share offers this theme's own link
      // until it changes.
      useQREditorStore.getState().saveThemeCheckpoint();
    }
  }, [initialQRPreset, setThemeState]);

  // Links like /playground?type=wifi or ?style=…, applied once after the
  // saved state and any /playground/<themeId> theme, before the controls
  // mount (their forms read the store once).
  const { settled } = usePlaygroundParams({
    themePath: Boolean(initialQRPreset),
  });

  if (initialQRPreset && !initialQRPreset.style) {
    return (
      <div className="text-destructive flex h-full items-center justify-center">
        Fetched QR preset data is invalid.
      </div>
    );
  }

  // The editor store restores from localStorage on the client, so anything
  // rendered from it would differ from the server HTML (hydration errors and
  // shifted Radix ids). Render a neutral shell until mounted, and until a
  // playground link's parameters are in the store.
  if (!(isMounted && settled)) {
    return <EditorShell />;
  }

  const styles = themeState.styles;

  if (isMobile) {
    // Preview stays visible on top; the controls sit in a sheet below it.
    return (
      <DialogActionsProvider>
        <div className="relative isolate flex flex-1 flex-col overflow-hidden">
          <ActionBar layout="mobile" />
          <div className="relative flex h-[32svh] min-h-52 shrink-0 flex-col overflow-hidden">
            <QRPreviewPanel style={styles} />
            <AIWorkingGlow />
            <TrackQrGenerated />
          </div>
          <div className="bg-background relative z-10 -mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[calc(var(--radius)+0.25rem)] border-t shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]">
            <div
              aria-hidden
              className="bg-muted-foreground/25 mx-auto mt-2 mb-1 h-1 w-10 shrink-0 rounded-full"
            />
            <ThemeControlPanel styles={styles} onChange={handleStyleChange} />
          </div>
          <MobileActionBar />
        </div>
        <EditorOverlays />
      </DialogActionsProvider>
    );
  }

  // Desktop layout
  return (
    <DialogActionsProvider>
      <div className="relative isolate flex flex-1 overflow-hidden">
        <div className="size-full">
          <ResizablePanelGroup direction="horizontal" className="isolate">
            <ResizablePanel
              defaultSize={30}
              minSize={20}
              maxSize={40}
              className="z-1 min-w-[max(20%,22rem)]"
            >
              <div className="relative isolate flex h-full flex-1 flex-col">
                <ThemeControlPanel
                  styles={styles}
                  onChange={handleStyleChange}
                />
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={70}>
              {/* Room for the docked community sheet (25rem), so the
                  preview and toolbar stay in view beside it. */}
              <div
                className={cn(
                  "flex h-full flex-col",
                  communityOpen && "pr-[25rem]",
                )}
              >
                <div className="flex min-h-0 flex-1 flex-col">
                  <ActionBar />
                  <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    <QRPreviewPanel style={styles} />
                    <AIWorkingGlow />
                    <TrackQrGenerated />
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
      <EditorOverlays />
    </DialogActionsProvider>
  );
};

export default Editor;
