"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { Switch } from "@repo/design-system/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
} from "@repo/design-system/components/ui/tabs";
import { Sparkle } from "lucide-react";
import { getContrastLevel, getContrastRatio } from "qrdx";
import React, { use } from "react";
import { ColorPicker } from "@/components/editor/color-picker";
import ControlSection from "@/components/editor/control-section";
import { QREditActions } from "@/components/editor/qr-edit-actions";
import QRPresetSelect from "@/components/editor/qr-preset-select";
import TabsTriggerPill from "@/components/editor/tabs-trigger-pill";
import { HorizontalScrollArea } from "@/components/horizontal-scroll-area";
import { CornerEyeDotPatternSelector } from "@/components/playground/corner-eye-dot-pattern-selector";
import { CornerEyePatternSelector } from "@/components/playground/corner-eye-pattern-selector";
import { ErrorLevelSelector } from "@/components/playground/error-level-selector";
import { PatternSelector } from "@/components/playground/pattern-selector";
import { TemplateSelector } from "@/components/playground/template-selector";
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
  const { value, setValue, setStyle } = useQREditorStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { tab, handleSetTab } = useControlsTabFromUrl();
  const { isGenerating } = useAIQRGenerationCore();

  // Unwrap the promise to check if we're editing a saved theme

  // Calculate contrast ratio and level
  const contrastInfo = React.useMemo(() => {
    const fgColor = style.fgColor || "#000000";
    const bgColor = style.bgColor || "#ffffff";
    const ratio = getContrastRatio(fgColor, bgColor);
    const level = getContrastLevel(ratio);
    return {
      ratio: ratio.toFixed(2),
      ...level,
    };
  }, [style.fgColor, style.bgColor]);

  // Handle custom logo file upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setStyle({ ...style, customLogo: result });
      };
      reader.readAsDataURL(file);
    }
  };

  // Clear custom logo
  const handleClearLogo = () => {
    setStyle({ ...style, customLogo: undefined });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const theme = use(qrPromise);

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
              <TabsTriggerPill value="logo">Logo</TabsTriggerPill>
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
              <ControlSection title="Content" expanded>
                <div className="space-y-2">
                  <Label className="text-xs" htmlFor="url-input">
                    URL or Text
                  </Label>
                  <Input
                    id="url-input"
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Enter URL or text"
                    type="text"
                    value={value}
                  />
                  <p className="text-muted-foreground text-xs">
                    Enter the content for your QR code
                  </p>
                </div>
              </ControlSection>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="colors"
            className="mt-1 size-full overflow-hidden"
          >
            <ScrollArea className="h-full px-4">
              <ControlSection title="Colors" expanded>
                <div className="space-y-3">
                  <ColorPicker
                    color={style.fgColor || "#000000"}
                    label="QR Color"
                    name="fgColor"
                    onChange={(value) =>
                      setStyle({ ...style, fgColor: value as string })
                    }
                  />
                  <ColorPicker
                    color={style.bgColor || "#ffffff"}
                    label="Background"
                    name="bgColor"
                    onChange={(value) =>
                      setStyle({ ...style, bgColor: value as string })
                    }
                  />
                  <ColorPicker
                    color={style.eyeColor || style.fgColor || "#000000"}
                    label="Eye Color"
                    name="eyeColor"
                    onChange={(value) =>
                      setStyle({ ...style, eyeColor: value as string })
                    }
                  />
                  <ColorPicker
                    color={style.dotColor || style.fgColor || "#000000"}
                    label="Dot Color"
                    name="dotColor"
                    onChange={(value) =>
                      setStyle({ ...style, dotColor: value as string })
                    }
                  />
                </div>

                {/* Contrast Feedback */}
                <div
                  className={`mt-4 flex items-center gap-3 rounded-lg px-3 py-2 ${
                    contrastInfo.warning
                      ? "border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950"
                      : "border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      contrastInfo.warning
                        ? "bg-orange-100 dark:bg-orange-900"
                        : "bg-green-100 dark:bg-green-900"
                    }`}
                  >
                    {contrastInfo.warning ? (
                      <span className="font-bold text-orange-600 text-xs dark:text-orange-400">
                        !
                      </span>
                    ) : (
                      <span className="font-bold text-green-600 text-xs dark:text-green-400">
                        ✓
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-xs ${
                      contrastInfo.warning
                        ? "text-orange-800 dark:text-orange-200"
                        : "text-green-800 dark:text-green-200"
                    }`}
                  >
                    {contrastInfo.warning
                      ? "Hard to scan. Use more contrast colors."
                      : "Great! Your QR code is easy to scan."}
                  </span>
                </div>
              </ControlSection>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="patterns"
            className="mt-1 size-full overflow-hidden"
          >
            <ScrollArea className="h-full px-4">
              <ControlSection title="Dot Patterns" expanded>
                <PatternSelector />
              </ControlSection>

              <ControlSection title="Corner Eye Patterns" expanded>
                <CornerEyePatternSelector />
              </ControlSection>

              <ControlSection title="Internal Eye Patterns">
                <CornerEyeDotPatternSelector />
              </ControlSection>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="frames"
            className="mt-1 size-full overflow-hidden"
          >
            <ScrollArea className="h-full px-4">
              <ControlSection title="Frames" expanded>
                <TemplateSelector />
              </ControlSection>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="logo" className="mt-1 size-full overflow-hidden">
            <ScrollArea className="h-full px-4">
              <ControlSection title="Logo" expanded>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50">
                    <Label
                      className="cursor-pointer text-xs"
                      htmlFor="show-logo"
                    >
                      Show Logo
                    </Label>
                    <Switch
                      checked={style.showLogo || false}
                      id="show-logo"
                      onCheckedChange={(value) =>
                        setStyle({ ...style, showLogo: value })
                      }
                    />
                  </div>
                  {style.showLogo && (
                    <div className="space-y-3">
                      <div>
                        <Label
                          className="mb-2 block text-xs"
                          htmlFor="logo-upload"
                        >
                          Upload Custom Logo
                        </Label>
                        <Input
                          accept="image/*"
                          id="logo-upload"
                          onChange={handleLogoUpload}
                          ref={fileInputRef}
                          type="file"
                          className="text-xs"
                        />
                        <p className="mt-1 text-muted-foreground text-xs">
                          Supports PNG, JPG, SVG
                        </p>
                      </div>
                      {style.customLogo && (
                        <div className="space-y-2">
                          <div className="relative flex items-center justify-center rounded-lg border bg-muted/30 p-4">
                            <img
                              alt="Custom logo preview"
                              className="max-h-24 max-w-full object-contain"
                              src={style.customLogo}
                            />
                          </div>
                          <Button
                            onClick={handleClearLogo}
                            size="sm"
                            variant="outline"
                            className="w-full"
                          >
                            Clear Logo
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ControlSection>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="settings"
            className="mt-1 size-full overflow-hidden"
          >
            <ScrollArea className="h-full px-4">
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

export default QRControlPanel;
