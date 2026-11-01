/** biome-ignore-all lint/correctness/useExhaustiveDependencies: false positive */
"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@repo/design-system/components/ui/resizable";
import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import React, { use, useEffect } from "react";
import { useTrackQrGenerated } from "@/lib/analytics/react";
import { DialogActionsProvider } from "@/lib/hooks/use-dialog-actions";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useQREditorStore } from "@/store/editor-store";
import type { Theme, ThemeStyles } from "@/types/theme";
import { ActionBar } from "./editor/action-bar";
import { AIWorkingGlow } from "./editor/ai/ai-working-glow";
import ThemeControlPanel from "./qr-control-panel";
import QRPreviewPanel from "./qr-preview-panel";

// Exported so components/lazy-editor.tsx's inferred type can name it (TS4023).
export interface EditorProps {
  themePromise: Promise<Theme | null>;
}

/** Static placeholder with the editor's layout, shown until hydration. */
function EditorShell() {
  return (
    <div
      aria-busy="true"
      className="relative isolate flex flex-1 flex-col-reverse overflow-hidden md:flex-row"
    >
      <div className="flex shrink-0 flex-col gap-3 border-b p-4 md:w-[30%] md:min-w-[22rem] md:border-r md:border-b-0">
        <div className="bg-muted/60 h-10 animate-pulse rounded-full" />
        <div className="bg-muted/40 h-16 animate-pulse rounded-xl" />
        <div className="bg-muted/40 h-9 animate-pulse rounded-md" />
        <div className="bg-muted/30 hidden h-40 animate-pulse rounded-xl md:block" />
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="bg-muted/30 aspect-square w-full max-w-72 animate-pulse rounded-2xl" />
      </div>
      <span className="sr-only">Loading the editor…</span>
    </div>
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
    }
  }, [initialQRPreset, setThemeState]);

  if (initialQRPreset && !initialQRPreset.style) {
    return (
      <div className="text-destructive flex h-full items-center justify-center">
        Fetched QR preset data is invalid.
      </div>
    );
  }

  // The editor store restores from localStorage on the client, so anything
  // rendered from it would differ from the server HTML (hydration errors and
  // shifted Radix ids). Render a neutral shell until mounted.
  if (!isMounted) {
    return <EditorShell />;
  }

  const styles = themeState.styles;

  if (isMobile) {
    // Preview stays visible on top; the controls sit in a sheet below it.
    return (
      <DialogActionsProvider>
        <div className="relative isolate flex flex-1 flex-col overflow-hidden">
          <ActionBar />
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
        </div>
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
              <div className="flex h-full flex-col">
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
    </DialogActionsProvider>
  );
};

export default Editor;
