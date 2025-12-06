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
import { useQREditorStore } from "@/store/editor-store";
import type { QRPreset, QRStyle } from "@/types/qr";
import { getPresetById } from "@/utils/qr-presets";
import { ActionBar } from "./editor/action-bar";
import QRControlPanel from "./qr-control-panel";
import QRPreviewPanel from "./qr-preview-panel";

interface EditorProps {
  qrPromise: Promise<QRPreset | null>;
}

const Editor: React.FC<EditorProps> = ({ qrPromise }) => {
  const isMobile = useIsMobile();

  const { applyPreset } = useQREditorStore();

  const themeState = useQREditorStore((state) => state.style);
  const setThemeState = useQREditorStore((state) => state.setStyle);

  const initialQRPreset = qrPromise ? use(qrPromise) : null;

  const handleStyleChange = React.useCallback(
    (newStyles: Partial<QRStyle>) => {
      const prev = useQREditorStore.getState().style;
      setThemeState({ ...prev, ...newStyles });
    },
    [setThemeState],
  );

  useEffect(() => {
    if (initialQRPreset) {
      applyPreset(initialQRPreset);
    } else {
      // Apply default preset if no preset is loaded
      const { currentPreset, applyPreset: applyPresetFn } =
        useQREditorStore.getState();
      if (!currentPreset) {
        const defaultPreset = getPresetById("default");
        if (defaultPreset) {
          applyPresetFn(defaultPreset);
        }
      }
    }
  }, [initialQRPreset, applyPreset]);

  if (initialQRPreset && !initialQRPreset.style) {
    return (
      <div className="text-destructive flex h-full items-center justify-center">
        Fetched QR preset data is invalid.
      </div>
    );
  }

  const styles = themeState as Partial<QRStyle>;

  // Mobile layout
  if (isMobile) {
    return (
      <div className="relative isolate flex flex-1 overflow-hidden">
        <div className="size-full flex-1 overflow-hidden">
          <Tabs defaultValue="controls" className="h-full">
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
                  qrPromise={qrPromise}
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
        <ResizablePanelGroup direction="horizontal" className="isolate">
          <ResizablePanel
            defaultSize={30}
            minSize={20}
            maxSize={40}
            className="z-1 min-w-[max(20%,22rem)]"
          >
            <div className="relative isolate flex h-full flex-1 flex-col">
              <QRControlPanel
                style={styles}
                onChange={handleStyleChange}
                qrPromise={qrPromise}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={70}>
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
