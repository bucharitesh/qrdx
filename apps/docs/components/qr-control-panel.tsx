"use client";

import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { Brush2, Edit2 } from "iconsax-reactjs";
import type * as React from "react";
import { AnimatedBot } from "@/components/editor/ai/animated-bot";
import { ChatInterface } from "@/components/editor/ai/chat-interface";
import { ShineText } from "@/components/editor/ai/shine-border";
import { ContentControls } from "@/components/editor/control-sections/content-controls";
import { DesignControls } from "@/components/editor/control-sections/design-controls";
import QrPresetSelect from "@/components/editor/qr-preset-select";
import { useAIQRGenerationCore } from "@/lib/hooks/use-ai-qr-generation-core";
import {
  type ControlTab,
  useControlsTabFromUrl,
} from "@/lib/hooks/use-controls-tab-from-url";
import type { QRStyle } from "@/types/theme";

interface ThemeControlPanelProps {
  styles: QRStyle;
  onChange: (styles: QRStyle) => void;
}

// Radix renders the viewport child as a table, which lets long rows widen it.
const scrollAreaClass =
  "h-full [&_[data-slot=scroll-area-viewport]>div]:!block";

const triggerClass =
  "h-full gap-1.5 text-[13px] data-[state=active]:text-foreground text-muted-foreground";

function GenerateTrigger({ thinking }: { thinking: boolean }) {
  // Same tab as its siblings (no coloured border); the only accent is a
  // colour shine passing through the label every few seconds.
  return (
    <TabsTrigger className={triggerClass} value="ai">
      <AnimatedBot thinking={thinking} />
      <ShineText className="font-medium" tone="color">
        Generate
      </ShineText>
    </TabsTrigger>
  );
}

/**
 * The editor's left panel: Content (what it opens) → Design (how it looks)
 * → Generate (AI). The old "Settings" tab URL opens Design at the Logo section.
 */
const ThemeControlPanel = ({ styles, onChange }: ThemeControlPanelProps) => {
  const { tab, handleSetTab } = useControlsTabFromUrl();
  const { isGenerating } = useAIQRGenerationCore();
  const view: ControlTab = tab === "settings" ? "customisations" : tab;

  const panelContent = (value: ControlTab, children: React.ReactNode) => (
    <TabsContent
      className="mt-0 min-h-0 overflow-hidden data-[state=inactive]:hidden"
      value={value}
    >
      {children}
    </TabsContent>
  );

  return (
    <>
      <div className="border-b">
        <QrPresetSelect className="h-14 rounded-none" disabled={isGenerating} />
      </div>
      <Tabs
        className="flex min-h-0 w-full flex-1 flex-col gap-0"
        onValueChange={(next) => handleSetTab(next as ControlTab)}
        value={view}
      >
        <div className="border-b px-3 py-2.5">
          <TabsList className="grid h-10 w-full grid-cols-3">
            <TabsTrigger className={triggerClass} value="content">
              <Edit2 className="size-4" />
              Content
            </TabsTrigger>
            <TabsTrigger className={triggerClass} value="customisations">
              <Brush2 className="size-4" />
              Design
            </TabsTrigger>
            <GenerateTrigger thinking={isGenerating} />
          </TabsList>
        </div>

        {panelContent(
          "content",
          <ScrollArea className={scrollAreaClass}>
            <ContentControls onNext={() => handleSetTab("customisations")} />
          </ScrollArea>,
        )}

        {panelContent(
          "customisations",
          <ScrollArea className={scrollAreaClass}>
            <DesignControls
              focus={tab === "settings" ? "logo" : undefined}
              onChange={onChange}
              styles={styles}
            />
          </ScrollArea>,
        )}

        {panelContent("ai", <ChatInterface />)}
      </Tabs>
    </>
  );
};

export default ThemeControlPanel;
