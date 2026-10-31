"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { GalleryAdd, Trash } from "iconsax-reactjs";
import * as React from "react";
import ControlSection from "@/components/editor/control-section";
import { DEFAULT_QR_LOGO, MAX_LOGO_FILE_SIZE } from "@/lib/constants";
import { soundEvent } from "@/lib/sound/emit";
import type { ThemeStyles } from "@/types/theme";
import { LogoPresets, logoIconName } from "./logo-presets";
import { OptionGroupLabel } from "./option-tiles";

const ALLOWED_LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];

interface LogoControlsProps {
  style: Partial<ThemeStyles>;
  onStyleChange: (styles: Partial<ThemeStyles>) => void;
  /** Open the section (e.g. when jumping here from the old Settings tab) */
  expanded?: boolean;
}

export function LogoControls({
  style,
  onStyleChange,
  expanded,
}: LogoControlsProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const showLogo = style.showLogo ?? false;
  const iconName = logoIconName(style.customLogo);
  const logoName = iconName
    ? `${iconName} icon`
    : style.customLogo
      ? "Your logo"
      : "QRdx logo";

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Logos are inlined as data URLs into the saved theme and local storage
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error("Unsupported logo format", {
        description: "Use a PNG, JPG, WebP or SVG image.",
      });
      e.target.value = "";
      return;
    }

    if (file.size > MAX_LOGO_FILE_SIZE) {
      toast.error("Logo is too large", {
        description: `Logos must be ${MAX_LOGO_FILE_SIZE / 1024 / 1024}MB or smaller.`,
      });
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onStyleChange({ ...style, customLogo: reader.result, showLogo: true });
        soundEvent("apply");
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read logo file");
    };
    reader.readAsDataURL(file);
  };

  const handleClearLogo = () => {
    onStyleChange({ ...style, customLogo: undefined });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <ControlSection
      expanded={expanded}
      hint="logo"
      id="section-logo"
      summary={showLogo ? logoName : "Off"}
      title="Logo"
    >
      <input
        accept={ALLOWED_LOGO_TYPES.join(",")}
        aria-label="Upload logo"
        className="sr-only"
        id="logo-upload"
        onChange={handleLogoUpload}
        ref={fileInputRef}
        type="file"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label className="cursor-pointer text-sm" htmlFor="show-logo">
            Logo in the center
          </Label>
          <p className="text-muted-foreground text-xs">
            Covers a few dots; error correction fills them in.
          </p>
        </div>
        <Switch
          checked={showLogo}
          id="show-logo"
          onCheckedChange={(value) =>
            onStyleChange({ ...style, showLogo: value })
          }
        />
      </div>

      <div>
        <OptionGroupLabel>Quick icons</OptionGroupLabel>
        <LogoPresets
          active={showLogo}
          logo={style.customLogo}
          onPick={(logo) =>
            onStyleChange({ ...style, customLogo: logo, showLogo: true })
          }
          onUpload={() => fileInputRef.current?.click()}
        />
      </div>

      {showLogo && (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white p-1.5 ring-1 ring-black/5">
            <img
              alt={logoName}
              className="max-h-full max-w-full object-contain"
              src={style.customLogo ?? DEFAULT_QR_LOGO}
            />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-muted-foreground text-xs">
              PNG, JPG, WebP or SVG, up to {MAX_LOGO_FILE_SIZE / 1024 / 1024}
              MB. Square images with some padding look best.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                <GalleryAdd />
                {style.customLogo && !iconName ? "Replace" : "Upload your logo"}
              </Button>
              {style.customLogo && (
                <Button
                  onClick={handleClearLogo}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash />
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </ControlSection>
  );
}
