/** biome-ignore-all lint/correctness/useExhaustiveDependencies: false positive */
"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@repo/design-system/components/ui/resizable";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { useIsMobile } from "@repo/design-system/hooks/use-mobile";
import { Eye, Sliders } from "lucide-react";
import React, { use, useEffect } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useQREditorStore } from "@/store/editor-store";
import type { Theme, ThemeStyles } from "@/types/theme";
import { ActionBar } from "./editor/action-bar";
import QRControlPanel from "./qr-control-panel";
import QRPreviewPanel from "./qr-preview-panel";
import { QrdxLogoAnimation } from "./qrdx-logo-animation";

interface EditorProps {
  themePromise: Promise<Theme | null>;
}

const Editor: React.FC<EditorProps> = ({ themePromise }) => {
  const isMobile = useIsMobile();
  const isMounted = useMounted();

  const { applyThemePreset } = useQREditorStore();

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

  const styles = themeState.styles;

  // Prevent hydration mismatch by only rendering after mount
  if (!isMounted) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <QrdxLogoAnimation size={100} />
        <p className="text-muted-foreground text-sm">Loading Playground...</p>
      </div>
    </div>
    );
  }

  // Mobile layout
  if (isMobile) {
    return (
      <div className="relative isolate flex flex-1 overflow-hidden">
        <div className="size-full flex-1 overflow-hidden">
          <Tabs defaultValue="controls" className="h-full" id="mobile-editor-tabs">
            <TabsList className="w-full rounded-none">
              <TabsTrigger value="controls" className="flex-1">
                <Sliders className="mr-2 h-4 w-4" />
                Controls
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex-1">
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="controls"
              className="mt-0 h-[calc(100%-2.5rem)]"
            >
              <div className="flex h-full flex-col">
                <QRControlPanel
                  style={styles}
                  onChange={handleStyleChange}
                  themePromise={themePromise}
                />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="mt-0 h-[calc(100%-2.5rem)]">
              <div className="flex h-full flex-col">
                <ActionBar />
                <QRPreviewPanel style={styles} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="relative isolate flex flex-1 overflow-hidden">
      <div className="size-full">
        <ResizablePanelGroup 
          direction="horizontal" 
          className="isolate"
          id="editor-panel-group"
        >
          <ResizablePanel
            id="control-panel"
            defaultSize={30}
            minSize={20}
            maxSize={40}
            className="z-1 min-w-[max(20%,22rem)]"
          >
            <div className="relative isolate flex h-full flex-1 flex-col">
              <QRControlPanel
                style={styles}
                onChange={handleStyleChange}
                themePromise={themePromise}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle id="editor-resize-handle" />
          <ResizablePanel 
            id="preview-panel"
            defaultSize={70}
          >
            <div className="flex h-full flex-col">
              <div className="flex min-h-0 flex-1 flex-col">
                <ActionBar />
                <QRPreviewPanel style={styles} />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

export default Editor;
