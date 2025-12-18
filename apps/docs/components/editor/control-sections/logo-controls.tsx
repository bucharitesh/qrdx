"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Slider } from "@repo/design-system/components/ui/slider";
import { Switch } from "@repo/design-system/components/ui/switch";
import * as React from "react";
import ControlSection from "@/components/editor/control-section";
import { BrandLogoSelector } from "@/components/playground/brand-logo-selector";
import { VariantSelector } from "@/components/playground/variant-selector";
import type { ThemeStyles } from "@/types/theme";

interface LogoControlsProps {
  style: Partial<ThemeStyles>;
  onStyleChange: (styles: Partial<ThemeStyles>) => void;
}

export function LogoControls({ style, onStyleChange }: LogoControlsProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const isLogoQR = style.type === "logo_qr";
  const logoSize = style.logoSettings?.logoSize || 100; // Percentage: default 100%

  // Handle custom logo file upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (isLogoQR) {
          // For logo QR, update logoSettings
          onStyleChange({
            ...style,
            type: "logo_qr",
            logoSettings: {
              src: result,
              logoSize: logoSize,
            },
          });
        } else {
          // For default QR, use customLogo
          onStyleChange({ ...style, customLogo: result });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Clear custom logo
  const handleClearLogo = () => {
    if (isLogoQR) {
      onStyleChange({ ...style, logoSettings: undefined });
    } else {
      onStyleChange({ ...style, customLogo: undefined });
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle logo size change (percentage)
  const handleLogoSizeChange = (value: number[]) => {
    const newSize = value[0];
    onStyleChange({
      ...style,
      logoSettings: {
        ...(style.logoSettings || { src: "" }),
        logoSize: newSize,
      },
    });
  };

  const hasLogo = isLogoQR
    ? !!style.logoSettings?.src
    : !!style.customLogo;

  return (
    <ControlSection title="Logo" expanded>
      <div className="space-y-4">
        {/* Variant Selector */}
        <div>
          <Label className="mb-3 block text-xs font-semibold">QR Variant</Label>
          <VariantSelector />
        </div>

        {/* Logo QR Controls */}
        {isLogoQR && (
          <>
            {/* Brand Logo Selector */}
            <BrandLogoSelector />

            {/* Separator */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background text-muted-foreground px-2">
                  Or upload custom
                </span>
              </div>
            </div>

            {/* Custom Logo Upload */}
            <div>
              <Label className="mb-2 block text-xs" htmlFor="logo-upload">
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

            {/* Logo Preview and Clear */}
            {hasLogo && (
              <div className="space-y-2">
                <div className="relative flex items-center justify-center rounded-lg border bg-muted/30 p-4">
                  <img
                    alt="Logo preview"
                    className="max-h-24 max-w-full object-contain"
                    src={style.logoSettings?.src}
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

            {/* Logo Size Slider (Percentage) */}
            {hasLogo && (
              <div>
                <Label className="mb-3 block text-xs">
                  Logo Size: <span className="font-semibold">{logoSize}%</span>
                </Label>
                <Slider
                  value={[logoSize]}
                  onValueChange={handleLogoSizeChange}
                  min={10}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="mt-2 flex justify-between text-muted-foreground text-xs">
                  <span>10%</span>
                  <span>100%</span>
                </div>
              </div>
            )}

            {/* Info message */}
            <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950/20">
              <p className="text-blue-900 text-xs dark:text-blue-300">
                <strong>Note:</strong> Colors are fixed (black/white) in Logo QR
                mode for optimal contrast. Only patterns can be customized.
              </p>
            </div>
          </>
        )}

        {/* Default QR Controls */}
        {!isLogoQR && (
          <>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50">
              <Label className="cursor-pointer text-xs" htmlFor="show-logo">
                Show Logo
              </Label>
              <Switch
                checked={style.showLogo || false}
                id="show-logo"
                onCheckedChange={(value) =>
                  onStyleChange({ ...style, showLogo: value })
                }
              />
            </div>
            {style.showLogo && (
              <div className="space-y-3">
                <div>
                  <Label className="mb-2 block text-xs" htmlFor="logo-upload">
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
          </>
        )}
      </div>
    </ControlSection>
  );
}


