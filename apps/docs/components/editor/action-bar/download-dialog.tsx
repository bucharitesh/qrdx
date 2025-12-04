"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { toast } from "@repo/design-system";
import { DownloadIcon } from "lucide-react";
import {
  type DownloadSize,
  downloadQRCode,
  getQRData,
  PRESET_SIZES,
  validateSize,
} from "qrdx";
import React from "react";
import { useDownloadStore } from "@/store/download-store";
import { useQREditorStore } from "@/store/editor-store";
import type { DownloadOptions as DownloadOptionsType } from "@/types/qr";

interface DownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DownloadDialog({ open, onOpenChange }: DownloadDialogProps) {
  const { value, style } = useQREditorStore();
  const { downloadOptions, updateDownloadOption } = useDownloadStore();
  const [sizeError, setSizeError] = React.useState<string>("");
  const [isDownloading, setIsDownloading] = React.useState(false);

  const qrProps = React.useMemo(
    () => ({
      ...getQRData({
        value,
        fgColor: style.fgColor,
        bgColor: style.bgColor,
        eyeColor: style.eyeColor,
        dotColor: style.dotColor,
        bodyPattern: style.bodyPattern,
        hideLogo: !style.showLogo,
        logo: style.customLogo,
      }),
      level: style.level,
      cornerEyePattern: style.cornerEyePattern,
      cornerEyeDotPattern: style.cornerEyeDotPattern,
      templateId: style.templateId,
    }),
    [value, style],
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
    const size = getCurrentSize();
    const validation = validateSize(size.width, size.height);

    if (!validation.isValid) {
      setSizeError(validation.error || "Invalid size");
      return;
    }

    setIsDownloading(true);
    setSizeError("");

    try {
      await downloadQRCode(qrProps, {
        format: downloadOptions.format,
        size,
      });
      toast.success(`QR code downloaded as ${downloadOptions.format.toUpperCase()}`);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download QR Code</DialogTitle>
          <DialogDescription>
            Choose the size and format for your QR code download.
          </DialogDescription>
        </DialogHeader>
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
                <SelectContent className="w-full">
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
                  updateDownloadOption("format", value as "png" | "jpg" | "svg")
                }
              >
                <SelectTrigger id="format-select" className="w-full">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent className="w-full">
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="jpg">JPG</SelectItem>
                  <SelectItem value="svg">SVG</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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
      </DialogContent>
    </Dialog>
  );
}

