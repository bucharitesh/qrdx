"use client";

import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
} from "@repo/design-system/components/ui/tabs";
import { Sparkle } from "lucide-react";
import React from "react";
import { ChatInterface } from "@/components/editor/ai/chat-interface";
import ControlSection from "@/components/editor/control-section";
import { GradientPicker } from "@/components/editor/gradient-picker";
import QrPresetSelect from "@/components/editor/qr-preset-select";
import TabsTriggerPill from "@/components/editor/theme-preview/tabs-trigger-pill";
import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import { defaultThemeState } from "@/config/qr";
import { useAIQRGenerationCore } from "@/lib/hooks/use-ai-qr-generation-core";
import {
  type ControlTab,
  useControlsTabFromUrl,
} from "@/lib/hooks/use-controls-tab-from-url";
import type { QRStyle } from "@/types/theme";
import { ContentControls } from "./editor/control-sections/content-controls";
import { LogoControls } from "./editor/control-sections/logo-controls";
import { CornerEyeDotPatternSelector } from "./playground/corner-eye-dot-pattern-selector";
import { CornerEyePatternSelector } from "./playground/corner-eye-pattern-selector";
import { ErrorLevelSelector } from "./playground/error-level-selector";
import { PatternSelector } from "./playground/pattern-selector";
import { TemplateSelector } from "./playground/template-selector";

interface ThemeControlPanelProps {
  styles: QRStyle;
  onChange: (styles: QRStyle) => void;
}

const ThemeControlPanel = ({ styles, onChange }: ThemeControlPanelProps) => {
  const { tab, handleSetTab } = useControlsTabFromUrl();
  const { isGenerating } = useAIQRGenerationCore();

  const currentStyles = React.useMemo(
    () => ({
      ...defaultThemeState.styles,
      ...styles,
    }),
    [styles],
  );

  const updateStyle = React.useCallback(
    <K extends keyof QRStyle>(key: K, value: QRStyle[K]) => {
      onChange({
        ...styles,
        [key]: value,
      });
    },
    [onChange, styles],
  );

  // Ensure we have valid styles for the current mode
  if (!currentStyles) {
    return null; // Or some fallback UI
  }

  return (
    <>
      <div className="border-b">
        <QrPresetSelect className="h-14 rounded-none" disabled={isGenerating} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col space-y-4">
        <Tabs
          value={tab}
          onValueChange={(v) => handleSetTab(v as ControlTab)}
          className="flex min-h-0 w-full flex-1 flex-col"
        >
          <HorizontalScrollArea className="mt-2 mb-1 px-4">
            <TabsList className="bg-background text-muted-foreground inline-flex w-fit items-center justify-center rounded-full px-0">
              <TabsTriggerPill value="content">Content</TabsTriggerPill>
              <TabsTriggerPill value="customisations">
                Customisations
              </TabsTriggerPill>
              <TabsTriggerPill value="settings">Settings</TabsTriggerPill>
              <TabsTriggerPill
                value="ai"
                className="data-[state=active]:[--effect:var(--secondary-foreground)] data-[state=active]:[--foreground:var(--muted-foreground)] data-[state=active]:[--muted-foreground:var(--effect)]"
              >
                <Sparkle className="size-3.5 text-current" />
                <span className="animate-text via-foreground from-muted-foreground to-muted-foreground flex items-center gap-1 bg-linear-to-r from-50% via-60% to-100% bg-size-[200%_auto] bg-clip-text text-sm text-transparent">
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
            value="customisations"
            className="mt-1 size-full overflow-hidden"
          >
            <ScrollArea className="h-full px-4">
              <ControlSection title="Colors" expanded>
                <GradientPicker
                  name="bgColor"
                  value={currentStyles.bgColor}
                  onChange={(color) => updateStyle("bgColor", color)}
                  label="Background Color"
                />
                <GradientPicker
                  name="fgColor"
                  value={currentStyles.fgColor}
                  onChange={(color) => updateStyle("fgColor", color)}
                  label="Foreground Color"
                />

                <GradientPicker
                  name="eyeColor"
                  value={currentStyles.eyeColor}
                  onChange={(color) => updateStyle("eyeColor", color)}
                  label="Eye Color"
                />
                <GradientPicker
                  name="dotColor"
                  value={currentStyles.dotColor}
                  onChange={(color) => updateStyle("dotColor", color)}
                  label="Dot Color"
                />
              </ControlSection>

              <ControlSection title="Dot Patterns" expanded kbd=",">
                <PatternSelector />
              </ControlSection>

              <ControlSection title="Corner Eye Patterns" kbd=".">
                <CornerEyePatternSelector />
              </ControlSection>

              <ControlSection title="Internal Eye Patterns" kbd="/">
                <CornerEyeDotPatternSelector />
              </ControlSection>

              <ControlSection title="Frames" expanded kbd="F">
                <TemplateSelector />
              </ControlSection>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="settings"
            className="mt-1 size-full overflow-hidden"
          >
            <ScrollArea className="h-full px-4">
              <LogoControls
                style={currentStyles}
                onStyleChange={(styles) => {
                  updateStyle("customLogo", styles.customLogo);
                  updateStyle("showLogo", styles.showLogo);
                }}
              />
              <ControlSection title="Error Correction" expanded>
                <ErrorLevelSelector />
              </ControlSection>
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

export default ThemeControlPanel;
