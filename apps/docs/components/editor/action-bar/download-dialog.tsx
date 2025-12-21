"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@repo/design-system/components/ui/input-group";
import { Label } from "@repo/design-system/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { DownloadIcon } from "lucide-react";
import {
  type DownloadSize,
  downloadQRCode,
  getQRData,
  PRESET_SIZES,
  validateSize,
} from "qrdx";
import React from "react";
import { useQREditorStore } from "@/store/editor-store";
import { usePreferencesStore } from "@/store/preferences-store";
import type { DownloadOptions as DownloadOptionsType } from "@/types/theme";
import { Slider } from "@repo/design-system/components/ui/slider";

interface DownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DownloadDialog({ open, onOpenChange }: DownloadDialogProps) {
  const { value, themeState } = useQREditorStore();
  const { downloadOptions, updateDownloadOption } = usePreferencesStore();
  const [sizeError, setSizeError] = React.useState<string>("");
  const [isDownloading, setIsDownloading] = React.useState(false);

  const qrProps = React.useMemo(
    () => ({
      ...getQRData({
        value,
        fgColor: themeState.styles.fgColor,
        bgColor:
          downloadOptions.transparent && downloadOptions.format !== "jpg"
            ? "transparent"
            : themeState.styles.bgColor,
        eyeColor: themeState.styles.eyeColor,
        dotColor: themeState.styles.dotColor,
        bodyPattern: themeState.styles.bodyPattern,
        hideLogo: !themeState.styles.showLogo,
        logo: themeState.styles.customLogo,
      }),
      level: themeState.styles.level,
      cornerEyePattern: themeState.styles.cornerEyePattern,
      cornerEyeDotPattern: themeState.styles.cornerEyeDotPattern,
      templateId: themeState.styles.templateId,
    }),
    [value, themeState, downloadOptions.transparent, downloadOptions.format],
  );

  // Get the current size based on selection
  const getCurrentSize = (): DownloadSize => {
    if (downloadOptions.sizePreset === "custom") {
      return {
        width: downloadOptions.width,
        height: downloadOptions.height,
      };
    }
    return PRESET_SIZES[downloadOptions.sizePreset] || PRESET_SIZES.medium;
  };

  // Validate custom size when it changes
  React.useEffect(() => {
    if (downloadOptions.sizePreset === "custom") {
      const width = downloadOptions.width;
      const height = downloadOptions.height;

      if (Number.isNaN(width) || Number.isNaN(height)) {
        setSizeError("Please enter valid numbers");
        return;
      }

      const validation = validateSize(width, height);
      if (!validation.isValid) {
        setSizeError(validation.error || "Invalid size");
      } else {
        setSizeError("");
      }
    } else {
      setSizeError("");
    }
  }, [
    downloadOptions.sizePreset,
    downloadOptions.width,
    downloadOptions.height,
  ]);

  const handleDownload = async () => {
    //1. Get size based on current selection 
    const size = getCurrentSize();
    //2. apply the multiplier only for the export
    const finalExportSize = {
      width: size.width * downloadOptions.multiplier,
      height: size.height * downloadOptions.multiplier,
    };
    // 3. Validate FINAL size
    const validation = validateSize(finalExportSize.width, finalExportSize.height);
    if (!validation.isValid) {
      setSizeError(validation.error || "Invalid size");
      return;
    }
    setIsDownloading(true);
    setSizeError("");

    try {
      await downloadQRCode(qrProps, {
        format: downloadOptions.format,
        size: finalExportSize,
        filename: downloadOptions.filename,

      });
      toast.success(
        `QR code downloaded as ${downloadOptions.format.toUpperCase()}`,
      );
      onOpenChange(false);
    } catch (error) {
      console.error("Error downloading QR code:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to download QR code";
      setSizeError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        className="p-6 sm:max-w-md"
        showCloseButton={true}
      >
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Download QR Code</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Choose the size and format for your QR code download.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid gap-4 grid-cols-2">
            {/* Size Selection */}
            <div className="space-y-2">
              <Label htmlFor="size-select">Size</Label>
              <Select
                defaultValue={downloadOptions.sizePreset}
                value={downloadOptions.sizePreset}
                onValueChange={(value) =>
                  updateDownloadOption(
                    "sizePreset",
                    value as DownloadOptionsType["sizePreset"],
                  )
                }
              >
                <SelectTrigger id="size-select" className="w-full">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent className="w-full z-100">
                  <SelectItem value="small">200 × 200</SelectItem>
                  <SelectItem value="medium">400 × 400</SelectItem>
                  <SelectItem value="large">800 × 800</SelectItem>
                  <SelectItem value="xlarge">1200 × 1200</SelectItem>
                  <SelectItem value="2xl">1600 × 1600</SelectItem>
                  <SelectItem value="3xl">2000 × 2000</SelectItem>
                  <SelectItem value="custom">Custom Size</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Format Selection */}
            <div className="space-y-2">
              <Label htmlFor="format-select">Format</Label>
              <Select
                defaultValue={downloadOptions.format}
                value={downloadOptions.format}
                onValueChange={(value) =>
                  updateDownloadOption(
                    "format",
                    value as "png" | "jpg" | "svg" | "pdf",
                  )
                }
              >
                <SelectTrigger id="format-select" className="w-full">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent className="w-full z-100">
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="jpg">JPG</SelectItem>
                  <SelectItem value="svg">SVG</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Size Multiplier Slider Implementation */}
          <div className="space-y-2 py-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="multiplier-slider" className="text-sm text-gray-400">Scale <span className="text-[0.6rem] text-muted-foreground">X</span></Label>
            </div>
            <div className="flex items-center gap-4">
              <Slider
                id="multiplier-slider"
                min={1}
                max={10}
                step={1}
                value={[downloadOptions.multiplier]}
                onValueChange={(value) => updateDownloadOption("multiplier", value[0])}
              />
              <InputGroup className="w-24">
                <InputGroupInput
                  type="number"
                  min={1}
                  max={10}
                  value={downloadOptions.multiplier}
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    // If empty, NaN, or out of range, restore to current valid value
                    if (!e.target.value || Number.isNaN(value) || value < 1 || value > 10) {
                      e.target.value = String(downloadOptions.multiplier);
                    } else {
                      updateDownloadOption("multiplier", value);
                    }
                  }}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    // Only update if valid
                    if (e.target.value && !Number.isNaN(value) && value >= 1 && value <= 10) {
                      updateDownloadOption("multiplier", value);
                    }
                  }}
                  className="text-sm font-bold text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>x</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>
            <p className="text-xs italic pt-2 text-gray-500">
              {getCurrentSize().width * downloadOptions.multiplier} x {getCurrentSize().height * downloadOptions.multiplier} px
            </p>
          </div>

          {/* Transparency toggle */}
          <div className="flex items-center space-x-3 py-2">
            <div className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                id="transparent-bg"
                aria-label="Transparent Background"
                className="h-5 w-5 rounded border-gray-700 bg-gray-800  accent-primary text-[#10b981] focus:ring-[#10b981]"
                checked={downloadOptions.transparent}
                onChange={(e) => updateDownloadOption("transparent", e.target.checked)}
              />
            </div>
            <Label htmlFor="transparent-bg" className="text-sm font-medium cursor-pointer">
              Transparent Background
            </Label>
          </div>

          {downloadOptions.format === "jpg" && downloadOptions.transparent && (
            <p className="text-[10px] text-amber-500 mt-1 italic">
              Note: JPG format does not support transparency. Background will be solid.
            </p>
          )}

          {/* Custom Size Inputs */}
          {downloadOptions.sizePreset === "custom" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="custom-width">Width (px)</Label>
                <Input
                  id="custom-width"
                  type="number"
                  min="50"
                  max="5000"
                  value={downloadOptions.width}
                  onChange={(e) =>
                    updateDownloadOption("width", Number(e.target.value))
                  }
                  placeholder="600"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-height">Height (px)</Label>
                <Input
                  id="custom-height"
                  type="number"
                  min="50"
                  max="5000"
                  value={downloadOptions.height}
                  onChange={(e) =>
                    updateDownloadOption("height", Number(e.target.value))
                  }
                  placeholder="600"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {sizeError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
              {sizeError}
            </div>
          )}

          {/* Download Button */}
          <Button
            variant="default"
            onClick={handleDownload}
            disabled={isDownloading || !!sizeError}
            className="w-full"
          >
            <DownloadIcon className="h-4 w-4" />
            {isDownloading
              ? "Downloading..."
              : `Download ${downloadOptions.format.toUpperCase()}`}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
