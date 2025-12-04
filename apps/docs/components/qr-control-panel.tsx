"use client";

import React from "react";
import { ColorInput } from "@repo/design-system/components/color-picker";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { ScrollArea } from "@repo/design-system/components/ui/scroll-area";
import { getContrastLevel, getContrastRatio } from "qrdx";
import { useQREditorStore } from "@/store/editor-store";
import { PatternSelector } from "@/components/playground/pattern-selector";
import { CornerEyePatternSelector } from "@/components/playground/corner-eye-pattern-selector";
import { CornerEyeDotPatternSelector } from "@/components/playground/corner-eye-dot-pattern-selector";
import { ErrorLevelSelector } from "@/components/playground/error-level-selector";
import { TemplateSelector } from "@/components/playground/template-selector";
import QRPresetSelect from "@/components/editor/qr-preset-select";
import ControlSection from "@/components/editor/control-section";
import type { QRStyle } from "@/types/qr";

interface QRControlPanelProps {
  style: Partial<QRStyle>;
  onChange?: (style: Partial<QRStyle>) => void;
}

const QRControlPanel: React.FC<QRControlPanelProps> = ({ style }) => {
  const { value, setValue, setStyle } = useQREditorStore();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  return (
    <>
      {/* Preset Selector Header */}
      <div className="border-b">
        <QRPresetSelect className="h-14 rounded-none" />
      </div>

      {/* Main Controls */}
      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="h-full">
          {/* Basic Settings */}
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

          {/* Colors */}
          <ControlSection title="Colors" expanded>
            <div className="grid grid-cols-2 gap-4">
              <ColorInput
                value={style.fgColor || "#000000"}
                label="QR Color"
                onChange={(value) =>
                  setStyle({ ...style, fgColor: value as string })
                }
              />
              <ColorInput
                value={style.bgColor || "#ffffff"}
                label="Background"
                onChange={(value) =>
                  setStyle({ ...style, bgColor: value as string })
                }
              />
              <ColorInput
                value={style.eyeColor || style.fgColor || "#000000"}
                label="Eye Color"
                onChange={(value) =>
                  setStyle({ ...style, eyeColor: value as string })
                }
              />
              <ColorInput
                value={style.dotColor || style.fgColor || "#000000"}
                label="Dot Color"
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

          {/* Dot Patterns */}
          <ControlSection title="Dot Patterns">
            <PatternSelector />
          </ControlSection>

          {/* Corner Eye Patterns */}
          <ControlSection title="Corner Eye Patterns">
            <CornerEyePatternSelector />
          </ControlSection>

          {/* Internal Eye Patterns */}
          <ControlSection title="Internal Eye Patterns">
            <CornerEyeDotPatternSelector />
          </ControlSection>

          {/* Error Correction */}
          <ControlSection title="Error Correction">
            <ErrorLevelSelector />
          </ControlSection>

          {/* Frames */}
          <ControlSection title="Frames">
            <TemplateSelector />
          </ControlSection>

          {/* Logo Settings */}
          <ControlSection title="Logo">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50">
                <Label className="cursor-pointer text-xs" htmlFor="show-logo">
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
      </div>
    </>
  );
};

export default QRControlPanel;
