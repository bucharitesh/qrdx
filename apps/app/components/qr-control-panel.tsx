"use client";

import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { Brush2, Edit2, MagicStar } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import type * as React from "react";
import { AnimatedBot } from "@/components/editor/ai/animated-bot";
import { ChatInterface } from "@/components/editor/ai/chat-interface";
import { ShineText } from "@/components/editor/ai/shine-border";
import { ArtPanel } from "@/components/editor/art/art-panel";
import { ContentControls } from "@/components/editor/control-sections/content-controls";
import { DesignControls } from "@/components/editor/control-sections/design-controls";
import QrPresetSelect from "@/components/editor/qr-preset-select";
import { useAIQRGenerationCore } from "@/lib/hooks/use-ai-qr-generation-core";
import {
  type ControlTab,
  useControlsTabFromUrl,
} from "@/lib/hooks/use-controls-tab-from-url";
import { usePlaygroundFocusStore } from "@/store/playground-focus-store";
import type { QRStyle } from "@/types/theme";

interface ThemeControlPanelProps {
  styles: QRStyle;
  onChange: (styles: QRStyle) => void;
}

// Radix renders the viewport child as a table, which lets long rows widen it.
const scrollAreaClass =
  "h-full [&_[data-slot=scroll-area-viewport]>div]:!block";

// Four tabs share a 22rem panel: each sizes to its label and they share the
// rest. Below about 340px across, the icons drop so the labels still fit.
const triggerClass =
  "h-full flex-auto gap-1 px-1.5 text-[13px] data-[state=active]:text-foreground text-muted-foreground [&>svg]:@max-[19.5rem]:hidden";

function GenerateTrigger({ thinking }: { thinking: boolean }) {
  const t = useTranslations("editor.qrControlPanel");
  // Same tab as its siblings (no coloured border); the only accent is a
  // colour shine passing through the label every few seconds.
  return (
    <TabsTrigger className={triggerClass} value="ai">
      <AnimatedBot thinking={thinking} />
      <ShineText className="font-medium" tone="color">
        {t("generate")}
      </ShineText>
    </TabsTrigger>
  );
}

/**
 * The editor's left panel: Content (what it opens) → Design (how it looks)
 * → Art (a picture in the code, or AI art) → Generate (AI themes, only where
 * this deployment has AI). The old "Settings" tab URL opens Design at the
 * Logo section, and a link's ?section= at its section.
 */
const ThemeControlPanel = ({ styles, onChange }: ThemeControlPanelProps) => {
  const t = useTranslations("editor.qrControlPanel");
  const { tab, handleSetTab, aiAvailable } = useControlsTabFromUrl();
  const { isGenerating } = useAIQRGenerationCore();
  const focusSection = usePlaygroundFocusStore((state) => state.section);
  const setFocusSection = usePlaygroundFocusStore((state) => state.setSection);
  const view: ControlTab = tab === "settings" ? "customisations" : tab;
  const focus =
    tab === "settings"
      ? "logo"
      : view === "customisations"
        ? (focusSection ?? undefined)
        : undefined;

  const changeTab = (next: ControlTab) => {
    setFocusSection(null);
    handleSetTab(next);
  };

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
        onValueChange={(next) => changeTab(next as ControlTab)}
        value={view}
      >
        <div className="@container border-b px-3 py-2.5">
          <TabsList className="flex h-10 w-full">
            <TabsTrigger className={triggerClass} value="content">
              <Edit2 className="size-4" />
              {t("content")}
            </TabsTrigger>
            <TabsTrigger className={triggerClass} value="customisations">
              <Brush2 className="size-4" />
              {t("design")}
            </TabsTrigger>
            <TabsTrigger className={triggerClass} value="art">
              <MagicStar className="size-4" />
              {t("art")}
            </TabsTrigger>
            {aiAvailable && <GenerateTrigger thinking={isGenerating} />}
          </TabsList>
        </div>

        {panelContent(
          "content",
          <ScrollArea className={scrollAreaClass}>
            <ContentControls onNext={() => changeTab("customisations")} />
          </ScrollArea>,
        )}

        {panelContent(
          "customisations",
          <ScrollArea className={scrollAreaClass}>
            <DesignControls focus={focus} onChange={onChange} styles={styles} />
          </ScrollArea>,
        )}

        {panelContent(
          "art",
          <ScrollArea className={scrollAreaClass}>
            <ArtPanel onChange={onChange} styles={styles} />
          </ScrollArea>,
        )}

        {aiAvailable && panelContent("ai", <ChatInterface />)}
      </Tabs>
    </>
  );
};

export default ThemeControlPanel;
