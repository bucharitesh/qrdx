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
import ThemePresetSelect from "@/components/editor/qr-preset-select";
import { TabsTriggerPillWithTooltip } from "@/components/editor/theme-preview/tabs-trigger-pill";
import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import { useAIQRGenerationCore } from "@/lib/hooks/use-ai-qr-generation-core";
import {
  type ControlTab,
  useControlsTabFromUrl,
} from "@/lib/hooks/use-controls-tab-from-url";
import { useQREditorStore } from "@/store/editor-store";
import type { QRPreset, QRStyle, Theme } from "@/types/theme";
import { ChatInterface } from "./editor/ai/chat-interface";

interface QRControlPanelProps {
  style: Partial<QRStyle>;
  onChange: (style: Partial<QRStyle>) => void;
  themePromise: Promise<Theme | null>;
}

const QRControlPanel: React.FC<QRControlPanelProps> = ({
  style,
  themePromise,
}) => {
  const { themeState, setThemeState } = useQREditorStore();
  const { tab, handleSetTab } = useControlsTabFromUrl();
  const { isGenerating } = useAIQRGenerationCore();
  const theme = use(themePromise);

  return (
    <>
      <div className="border-b">
        {!theme ? (
          <ThemePresetSelect
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
              <TabsTriggerPillWithTooltip 
                value="content" 
                kbd="1" 
                label="Content" 
                description="Manage QR code data, URL, text, and other content settings"
              >
                Content
              </TabsTriggerPillWithTooltip>
              <TabsTriggerPillWithTooltip 
                value="colors" 
                kbd="2" 
                label="Colors" 
                description="Customize QR code colors including foreground, background, and gradient styles"
              >
                Colors
              </TabsTriggerPillWithTooltip>
              <TabsTriggerPillWithTooltip 
                value="patterns" 
                kbd="3" 
                label="Patterns" 
                description="Choose from various QR code patterns, dots, eyes, and marker styles"
              >
                Patterns
              </TabsTriggerPillWithTooltip>
              <TabsTriggerPillWithTooltip 
                value="frames" 
                kbd="4" 
                label="Frames" 
                description="Add decorative frames, borders, and labels around your QR code"
              >
                Frames
              </TabsTriggerPillWithTooltip>
              <TabsTriggerPillWithTooltip 
                value="settings" 
                kbd="5" 
                label="Settings" 
                description="Configure advanced options including error correction, size, and logo placement"
              >
                Settings
              </TabsTriggerPillWithTooltip>
              <TabsTriggerPillWithTooltip
                value="ai"
                kbd="6"
                label="AI Generate"
                description="Use AI to automatically generate and customize QR codes with smart suggestions"
                className="data-[state=active]:[--effect:var(--secondary-foreground)] data-[state=active]:[--foreground:var(--muted-foreground)] data-[state=active]:[--muted-foreground:var(--effect)]"
              >
                <Sparkle className="mr-1 size-3.5 text-current" />
                <span className="animate-text via-foreground from-muted-foreground to-muted-foreground flex items-center gap-1 bg-linear-to-r from-50% via-60% to-100% bg-[200%_auto] bg-clip-text text-sm text-transparent">
                  Generate
                </span>
              </TabsTriggerPillWithTooltip>
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
              <ColorControls
                style={themeState.styles}
                onStyleChange={(styles) =>
                  setThemeState({ ...themeState, styles })
                }
              />
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
              <LogoControls
                style={themeState.styles}
                onStyleChange={(styles) =>
                  setThemeState({ ...themeState, styles })
                }
              />
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
