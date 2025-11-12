"use client";

import { ColorInput } from "@repo/design-system/components/color-picker";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { Redo2Icon, Undo2Icon } from "lucide-react";
import { getContrastLevel, getContrastRatio, QRCode } from "qrdx";
import { useEffect, useMemo, useRef } from "react";
import { CornerEyeDotPatternSelector } from "@/components/playground/corner-eye-dot-pattern-selector";
import { CornerEyePatternSelector } from "@/components/playground/corner-eye-pattern-selector";
import { DownloadOptions } from "@/components/playground/download-options";
import { ErrorLevelSelector } from "@/components/playground/error-level-selector";
import { PatternSelector } from "@/components/playground/pattern-selector";
import { PresetSelector } from "@/components/playground/preset-selector";
import { TemplateSelector } from "@/components/playground/template-selector";
import { useQREditorStore } from "@/store/editor-store";

const Page = () => {
  const { value, style, setValue, setStyle, undo, redo, canUndo, canRedo } =
    useQREditorStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate contrast ratio and level
  const contrastInfo = useMemo(() => {
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

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
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
  }, [undo, redo, canUndo, canRedo]);

  return (
    <div className="relative z-10 mx-auto w-full select-none p-2 md:p-6 overflow-x-scroll">
      <div className="rounded-xl border-0 p-3 backdrop-blur-sm md:p-8">
        <div className="grid h-full w-full grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left Column - Form Options */}
          <div className="flex h-full w-full flex-col gap-6 overflow-y-auto pr-0 lg:col-span-3 lg:pr-4">
            {/* Presets Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <PresetSelector />
            </div>

            {/* Basic Settings Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Basic Settings
              </h2>
              <div>
                <Label className="mb-2 block text-sm" htmlFor="url-input">
                  URL
                </Label>
                <Input
                  id="url-input"
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter URL"
                  type="text"
                  value={value}
                />
              </div>
            </div>

            {/* Pattern Selection Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Dot Patterns
              </h2>
              <PatternSelector />
            </div>

            {/* Corner Eye Pattern Selection Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Corner Eye Patterns
              </h2>
              <CornerEyePatternSelector />
            </div>

            {/* Corner Eye Dot Pattern Selection Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Internal Eye Patterns
              </h2>
              <CornerEyeDotPatternSelector />
            </div>

            {/* Error Correction Level Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Error Correction
              </h2>
              <ErrorLevelSelector />
            </div>

            {/* Template Selection Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">Frames</h2>
              <TemplateSelector />
            </div>

            {/* Color Customization Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Color Customization
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ColorInput
                  value={style.fgColor || "#000000"}
                  label="QR Color"
                  onChange={(value) =>
                    setStyle({ ...style, fgColor: value as string })
                  }
                />
                <ColorInput
                  value={style.bgColor || "#ffffff"}
                  label="Background Color"
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

              {/* Contrast Feedback within Color Section */}
              <div
                className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
                  contrastInfo.warning
                    ? "border border-orange-200 bg-orange-50"
                    : "border border-green-200 bg-green-50"
                }`}
              >
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    contrastInfo.warning ? "bg-orange-100" : "bg-green-100"
                  }`}
                >
                  {contrastInfo.warning ? (
                    <span className="font-bold text-orange-600 text-sm">!</span>
                  ) : (
                    <span className="font-bold text-green-600 text-sm">✓</span>
                  )}
                </div>
                <span
                  className={`font-medium text-sm ${
                    contrastInfo.warning ? "text-orange-800" : "text-green-800"
                  }`}
                >
                  {contrastInfo.warning
                    ? "Hard to scan. Use more contrast colors."
                    : "Great! Your QR code is easy to scan."}
                </span>
              </div>
            </div>

            {/* Logo Settings Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Logo Settings
              </h2>
              <div className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-gray-100">
                <Label
                  className="cursor-pointer font-medium text-sm"
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
                <div className="space-y-4">
                  <div>
                    <Label className="mb-2 block text-sm" htmlFor="logo-upload">
                      Custom Logo Image
                    </Label>
                    <Input
                      accept="image/*"
                      id="logo-upload"
                      onChange={handleLogoUpload}
                      ref={fileInputRef}
                      type="file"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Upload a custom logo image (PNG, JPG, SVG)
                    </p>
                  </div>
                  {style.customLogo && (
                    <div className="space-y-2">
                      <div className="relative flex items-center justify-center rounded-lg border bg-gray-50 p-4">
                        <img
                          alt="Custom logo preview"
                          className="max-h-32 max-w-full object-contain"
                          src={style.customLogo}
                        />
                      </div>
                      <Button
                        onClick={handleClearLogo}
                        size="sm"
                        variant="outline"
                      >
                        Clear Custom Logo
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Sticky QR Code Preview */}
          <div className="flex w-full justify-center lg:col-span-2 lg:justify-start">
            <div className="sticky top-18 flex h-fit w-full flex-col items-center justify-center gap-4 rounded-xl border border-gray-200 bg-white/90 p-6 shadow-lg backdrop-blur-sm">
              <div className="flex w-full items-center justify-between">
                <h2 className="font-semibold text-lg">Preview</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={undo}
                    disabled={!canUndo()}
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo2Icon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={redo}
                    disabled={!canRedo()}
                    title="Redo (Ctrl+Y)"
                  >
                    <Redo2Icon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <QRCode
                bgColor={style.bgColor}
                cornerEyeDotPattern={style.cornerEyeDotPattern}
                cornerEyePattern={style.cornerEyePattern}
                dotColor={style.dotColor}
                bodyPattern={style.bodyPattern}
                level={style.level}
                eyeColor={style.eyeColor}
                fgColor={style.fgColor}
                hideLogo={!style.showLogo}
                logo={style.customLogo}
                scale={2}
                templateId={style.templateId}
                value={value}
              />
              <div className="w-full border-t pt-4">
                <DownloadOptions />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Page;
