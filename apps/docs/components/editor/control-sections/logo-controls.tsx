"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import * as React from "react";
import ControlSection from "@/components/editor/control-section";
import type { QRStyle } from "@/types/qr";

interface LogoControlsProps {
  style: Partial<QRStyle>;
  onStyleChange: (style: Partial<QRStyle>) => void;
}

export function LogoControls({ style, onStyleChange }: LogoControlsProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Handle custom logo file upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        onStyleChange({ ...style, customLogo: result });
      };
      reader.readAsDataURL(file);
    }
  };

  // Clear custom logo
  const handleClearLogo = () => {
    onStyleChange({ ...style, customLogo: undefined });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <ControlSection title="Logo" expanded>
      <div className="space-y-4">
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
      </div>
    </ControlSection>
  );
}

