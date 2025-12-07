"use client";

import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
} from "@repo/design-system/components/ui/tabs";
import { Sparkle } from "lucide-react";
import { use } from "react";
import {
  ColorControls,
  ContentControls,
  FrameControls,
  LogoControls,
  PatternControls,
  SettingsControls,
} from "@/components/editor/control-sections";
import { QREditActions } from "@/components/editor/qr-edit-actions";
import QRPresetSelect from "@/components/editor/qr-preset-select";
import TabsTriggerPill from "@/components/editor/tabs-trigger-pill";
import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import { useAIQRGenerationCore } from "@/lib/hooks/use-ai-qr-generation-core";
import {
  type ControlTab,
  useControlsTabFromUrl,
} from "@/lib/hooks/use-controls-tab-from-url";
import { useQREditorStore } from "@/store/editor-store";
import type { QRPreset, QRStyle } from "@/types/qr";
import { ChatInterface } from "./editor/ai/chat-interface";

interface QRControlPanelProps {
  style: Partial<QRStyle>;
  onChange: (style: Partial<QRStyle>) => void;
  qrPromise: Promise<QRPreset | null>;
}

const QRControlPanel: React.FC<QRControlPanelProps> = ({
  style,
  qrPromise,
}) => {
  const { setStyle } = useQREditorStore();
  const { tab, handleSetTab } = useControlsTabFromUrl();
  const { isGenerating } = useAIQRGenerationCore();
  const theme = use(qrPromise);

  console.log("theme", qrPromise, theme);

  return (
    <>
      <div className="border-b">
        {!theme ? (
          <QRPresetSelect
            className="h-14 rounded-none"
            disabled={isGenerating}
          />
        ) : (
          <QREditActions theme={theme} disabled={isGenerating} />
        )}
      </div>

      {/* Main Controls */}
      <div className="flex min-h-0 flex-1 flex-col space-y-4">
        <Tabs
          value={tab}
          onValueChange={(v) => handleSetTab(v as ControlTab)}
          className="flex min-h-0 w-full flex-1 flex-col"
        >
          <HorizontalScrollArea className="mt-2 mb-1 px-4">
            <TabsList className="bg-background text-muted-foreground inline-flex w-fit items-center justify-center rounded-full px-0">
              <TabsTriggerPill value="content">Content</TabsTriggerPill>
              <TabsTriggerPill value="colors">Colors</TabsTriggerPill>
              <TabsTriggerPill value="patterns">Patterns</TabsTriggerPill>
              <TabsTriggerPill value="frames">Frames</TabsTriggerPill>
              <TabsTriggerPill value="settings">Settings</TabsTriggerPill>
              <TabsTriggerPill
                value="ai"
                className="data-[state=active]:[--effect:var(--secondary-foreground)] data-[state=active]:[--foreground:var(--muted-foreground)] data-[state=active]:[--muted-foreground:var(--effect)]"
              >
                <Sparkle className="mr-1 size-3.5 text-current" />
                <span className="animate-text via-foreground from-muted-foreground to-muted-foreground flex items-center gap-1 bg-gradient-to-r from-50% via-60% to-100% bg-[200%_auto] bg-clip-text text-sm text-transparent">
                  Generate
                </span>
              </TabsTriggerPill>
            </TabsList>
          </HorizontalScrollArea>

          <TabsContent
            value="content"
            className="mt-1 size-full overflow-hidden"
          >
            <ScrollArea className="h-full px-4">
              <ContentControls />
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="colors"
            className="mt-1 size-full overflow-hidden"
          >
            <ScrollArea className="h-full px-4">
              <ColorControls style={style} onStyleChange={setStyle} />
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="patterns"
            className="mt-1 size-full overflow-hidden"
          >
            <ScrollArea className="h-full px-4">
              <PatternControls />
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="frames"
            className="mt-1 size-full overflow-hidden"
          >
            <ScrollArea className="h-full px-4">
              <FrameControls />
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="settings"
            className="mt-1 size-full overflow-hidden"
          >
            <ScrollArea className="h-full px-4">
              <SettingsControls />
              <LogoControls style={style} onStyleChange={setStyle} />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="ai" className="mt-1 size-full overflow-hidden">
            <ChatInterface />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default QRControlPanel;
