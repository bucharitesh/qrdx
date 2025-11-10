"use client";

import { ColorInput } from "@repo/design-system/components/color-picker";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Switch } from "@repo/design-system/components/ui/switch";
import { QRCode } from "qrdx";
import { useRef } from "react";
import { useQRStore } from "@/lib/qr-store";
import { DownloadOptions } from "./download-options";
import { ErrorLevelSelector } from "./error-level-selector";

const Page = () => {
  const { url, qrStyles, setUrl, updateQrStyle, updateCustomProp } =
    useQRStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get custom prop value with type safety
  const getCustomProp = (key: string): string | number | undefined =>
    (qrStyles.customProps?.[key] as string | number | undefined) ?? undefined;

  // Handle custom logo file upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        updateQrStyle("customLogo", result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Clear custom logo
  const handleClearLogo = () => {
    updateQrStyle("customLogo", undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="relative z-10 mx-auto w-full max-w-7xl select-none p-2 md:p-6">
      <div className="rounded-xl border-0 p-3 backdrop-blur-sm md:p-8">
        <div className="grid h-full w-full grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left Column - Form Options */}
          <div className="flex h-full w-full flex-col gap-6 overflow-y-auto pr-0 lg:col-span-3 lg:pr-4">
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
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Enter URL"
                  type="text"
                  value={url}
                />
              </div>
            </div>

            {/* Error Correction Level Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Error Correction
              </h2>
              <ErrorLevelSelector />
            </div>

            {/* Color Customization Section */}
            <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
              <h2 className="border-b pb-2 font-semibold text-lg">
                Color Customization
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ColorInput
                  color={qrStyles.qrColor}
                  label="QR Color"
                  onChange={(value) => updateQrStyle("qrColor", value)}
                />
                <ColorInput
                  color={qrStyles.backgroundColor}
                  label="Background Color"
                  onChange={(value) => updateQrStyle("backgroundColor", value)}
                />
                <ColorInput
                  color={qrStyles.eyeColor || qrStyles.qrColor}
                  label="Eye Color"
                  onChange={(value) => updateQrStyle("eyeColor", value)}
                />
                <ColorInput
                  color={qrStyles.dotColor || qrStyles.qrColor}
                  label="Dot Color"
                  onChange={(value) => updateQrStyle("dotColor", value)}
                />
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
                  checked={qrStyles.showLogo}
                  id="show-logo"
                  onCheckedChange={(value) => updateQrStyle("showLogo", value)}
                />
              </div>
              {qrStyles.showLogo && (
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
                  {qrStyles.customLogo && (
                    <div className="space-y-2">
                      <div className="relative flex items-center justify-center rounded-lg border bg-gray-50 p-4">
                        <img
                          alt="Custom logo preview"
                          className="max-h-32 max-w-full object-contain"
                          src={qrStyles.customLogo}
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

            {/* FlamQR Customization Section */}
            {qrStyles.templateId === "FlamQR" && (
              <div className="space-y-4 rounded-xl border p-4 backdrop-blur-sm">
                <h2 className="border-b pb-2 font-semibold text-lg">
                  FlamQR Customization
                </h2>
                <div className="space-y-4">
                  {/* Custom Text */}
                  <div>
                    <Label className="mb-2 block text-sm" htmlFor="custom-text">
                      Custom Text
                    </Label>
                    <Input
                      id="custom-text"
                      onChange={(e) =>
                        updateCustomProp("customText", e.target.value)
                      }
                      placeholder="Enter custom text"
                      type="text"
                      value={(getCustomProp("customText") as string) || ""}
                    />
                  </div>

                  {/* Text Color */}
                  <ColorInput
                    color={(getCustomProp("textColor") as string) || "#000000"}
                    label="Text Color"
                    onChange={(value) => updateCustomProp("textColor", value)}
                  />

                  {/* Font Size */}
                  <div>
                    <Label className="mb-2 block text-sm" htmlFor="font-size">
                      Font Size
                    </Label>
                    <Input
                      id="font-size"
                      onChange={(e) => {
                        const value = Number.parseInt(e.target.value, 10);
                        if (!Number.isNaN(value)) {
                          updateCustomProp("fontSize", value);
                        }
                      }}
                      placeholder="40"
                      type="number"
                      value={(getCustomProp("fontSize") as number) || ""}
                    />
                  </div>

                  {/* Font Weight */}
                  <div>
                    <Label className="mb-2 block text-sm" htmlFor="font-weight">
                      Font Weight
                    </Label>
                    <Input
                      id="font-weight"
                      onChange={(e) => {
                        const value = Number.parseInt(e.target.value, 10);
                        if (!Number.isNaN(value)) {
                          updateCustomProp("fontWeight", value);
                        }
                      }}
                      placeholder="900"
                      step="100"
                      type="number"
                      value={(getCustomProp("fontWeight") as number) || 900}
                    />
                  </div>

                  {/* Font Letter Spacing */}
                  <div>
                    <Label
                      className="mb-2 block text-sm"
                      htmlFor="font-letter-spacing"
                    >
                      Font Letter Spacing
                    </Label>
                    <Input
                      id="font-letter-spacing"
                      onChange={(e) => {
                        const value = Number.parseFloat(e.target.value);
                        if (!Number.isNaN(value)) {
                          updateCustomProp("fontLetterSpacing", value);
                        }
                      }}
                      placeholder="6"
                      step="0.1"
                      type="number"
                      value={
                        (getCustomProp("fontLetterSpacing") as number) || ""
                      }
                    />
                  </div>

                  {/* Font Family */}
                  <div>
                    <Label className="mb-2 block text-sm" htmlFor="font-family">
                      Font Family
                    </Label>
                    <Select
                      onValueChange={(value) =>
                        updateCustomProp("fontFamily", value)
                      }
                      value={
                        (getCustomProp("fontFamily") as string) ||
                        "Arial, Helvetica, sans-serif"
                      }
                    >
                      <SelectTrigger className="w-full" id="font-family">
                        <SelectValue placeholder="Select font family" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Arial, Helvetica, sans-serif">
                          Arial
                        </SelectItem>
                        <SelectItem value="Georgia, serif">Georgia</SelectItem>
                        <SelectItem value="'Times New Roman', Times, serif">
                          Times New Roman
                        </SelectItem>
                        <SelectItem value="'Courier New', Courier, monospace">
                          Courier New
                        </SelectItem>
                        <SelectItem value="Verdana, Geneva, sans-serif">
                          Verdana
                        </SelectItem>
                        <SelectItem value="'Trebuchet MS', Helvetica, sans-serif">
                          Trebuchet MS
                        </SelectItem>
                        <SelectItem value="Impact, Charcoal, sans-serif">
                          Impact
                        </SelectItem>
                        <SelectItem value="'Comic Sans MS', cursive">
                          Comic Sans MS
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Inner Stroke Width */}
                  <div>
                    <Label
                      className="mb-2 block text-sm"
                      htmlFor="inner-stroke-width"
                    >
                      Inner Stroke Width
                    </Label>
                    <Input
                      id="inner-stroke-width"
                      max="10"
                      min="0"
                      onChange={(e) => {
                        const value = Number.parseFloat(e.target.value);
                        if (!Number.isNaN(value)) {
                          updateCustomProp("innerStrokeWidth", value);
                        }
                      }}
                      placeholder="0"
                      step="0.1"
                      type="number"
                      value={
                        (getCustomProp("innerStrokeWidth") as number) || ""
                      }
                    />
                  </div>

                  {/* Outer Stroke Width */}
                  <div>
                    <Label
                      className="mb-2 block text-sm"
                      htmlFor="outer-stroke-width"
                    >
                      Outer Stroke Width
                    </Label>
                    <Input
                      id="outer-stroke-width"
                      max="10"
                      min="0"
                      onChange={(e) => {
                        const value = Number.parseFloat(e.target.value);
                        if (!Number.isNaN(value)) {
                          updateCustomProp("outerStrokeWidth", value);
                        }
                      }}
                      placeholder="0"
                      step="0.1"
                      type="number"
                      value={
                        (getCustomProp("outerStrokeWidth") as number) || ""
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Sticky QR Code Preview */}
          <div className="flex w-full justify-center lg:col-span-2 lg:justify-start">
            <div className="sticky top-10 flex h-fit w-full flex-col items-center justify-center gap-4 rounded-xl border border-gray-200 bg-white/90 p-6 shadow-lg backdrop-blur-sm">
              <h2 className="text-center font-semibold text-lg">Preview</h2>
              <QRCode
                bgColor={qrStyles.backgroundColor}
                bodyPattern={qrStyles.bodyPattern}
                cornerEyeDotPattern={qrStyles.cornerEyeDotPattern}
                cornerEyePattern={qrStyles.cornerEyePattern}
                customProps={qrStyles.customProps}
                dotColor={qrStyles.dotColor}
                eyeColor={qrStyles.eyeColor}
                fgColor={qrStyles.qrColor}
                hideLogo={!qrStyles.showLogo}
                level={qrStyles.level}
                logo={qrStyles.customLogo}
                scale={2}
                templateId={qrStyles.templateId}
                url={url}
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
