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
import { QRDialogActionsProvider } from "@/lib/hooks/use-qr-dialog-actions";
import { useQREditorStore } from "@/store/editor-store";
import type { QRPreset, QRStyle } from "@/types/qr";
import QRControlPanel from "./qr-control-panel";
import QRPreviewPanel from "./qr-preview-panel";

interface EditorProps {
  qrPromise?: Promise<QRPreset | null>;
}

const EditorContent: React.FC<EditorProps> = ({ qrPromise }) => {
  const { style, setStyle, applyPreset } = useQREditorStore();
  const isMobile = useIsMobile();

  const initialQRPreset = qrPromise ? use(qrPromise) : null;

  const handleStyleChange = React.useCallback(
    (newStyles: Partial<QRStyle>) => {
      const prev = useQREditorStore.getState().style;
      setStyle({ ...prev, ...newStyles });
    },
    [setStyle],
  );

  useEffect(() => {
    if (initialQRPreset) {
      applyPreset(initialQRPreset);
    }
  }, [initialQRPreset, applyPreset]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const { undo, redo, canUndo, canRedo } = useQREditorStore.getState();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) {
          undo();
        }
      }
      // Ctrl+Y or Cmd+Shift+Z for redo
      if (
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        if (canRedo()) {
          redo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (initialQRPreset && !initialQRPreset.style) {
    return (
      <div className="text-destructive flex h-full items-center justify-center">
        Fetched QR preset data is invalid.
      </div>
    );
  }

  const styles = style as Partial<QRStyle>;

  // Mobile layout
  if (isMobile) {
    return (
      <div className="relative isolate flex flex-1 overflow-hidden">
        <div className="size-full flex-1 overflow-hidden">
          <Tabs defaultValue="controls" className="h-full">
            <TabsList className="w-full rounded-none border-b">
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
                <QRControlPanel style={styles} onChange={handleStyleChange} />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="mt-0 h-[calc(100%-2.5rem)]">
              <div className="flex h-full flex-col">
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
              <QRControlPanel style={style} onChange={handleStyleChange} />
            </div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={70}>
            <div className="flex h-full flex-col">
              <QRPreviewPanel style={style} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

const Editor: React.FC<EditorProps> = (props) => {
  return (
    <QRDialogActionsProvider>
      <EditorContent {...props} />
    </QRDialogActionsProvider>
  );
};

export default Editor;
