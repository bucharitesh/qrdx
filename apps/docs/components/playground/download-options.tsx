"use client";

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
import { CopyIcon, DownloadIcon } from "lucide-react";
import {
  type DownloadSize,
  downloadQRCode,
  getQRData,
  getSVGString,
  PRESET_SIZES,
  validateSize,
} from "qrdx";
import React from "react";
import { useQRStore } from "../../lib/qr-store";

export const DownloadOptions: React.FC = () => {
  const { url, qrStyles, downloadOptions, updateDownloadOption } = useQRStore();
  const [sizeError, setSizeError] = React.useState<string>("");
  const [isDownloading, setIsDownloading] = React.useState(false);

  const qrProps = React.useMemo(
    () => ({
      ...getQRData({
        value: url,
        fgColor: qrStyles.qrColor,
        bgColor: qrStyles.backgroundColor,
        eyeColor: qrStyles.eyeColor,
        dotColor: qrStyles.dotColor,
        bodyPattern: qrStyles.bodyPattern,
        hideLogo: !qrStyles.showLogo,
        logo: qrStyles.qrLogo,
      }),
      level: qrStyles.level,
      cornerEyePattern: qrStyles.cornerEyePattern,
      cornerEyeDotPattern: qrStyles.cornerEyeDotPattern,
      templateId: qrStyles.templateId,
    }),
    [url, qrStyles],
  );

  // Get the current size based on selection
  const getCurrentSize = (): DownloadSize => {
    if (downloadOptions.size === "custom") {
      return {
        width: downloadOptions.width,
        height: downloadOptions.height,
      };
    }
    return PRESET_SIZES[downloadOptions.size] || PRESET_SIZES.medium;
  };

  // Validate custom size when it changes
  React.useEffect(() => {
    if (downloadOptions.size === "custom") {
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
  }, [downloadOptions.size, downloadOptions.width, downloadOptions.height]);

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
    } catch (error) {
      console.error("Error downloading QR code:", error);
      setSizeError(
        error instanceof Error ? error.message : "Failed to download QR code",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopySVG = async () => {
    try {
      const svgContent = await getSVGString(qrProps);
      await navigator.clipboard.writeText(svgContent);
      console.log("SVG copied to clipboard");
    } catch (error) {
      console.error("Error copying SVG:", error);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="grid gap-4 grid-cols-2">
        {/* Size Selection */}
        <div className="space-y-2">
          <Label htmlFor="size-select">Size</Label>
          <Select
            defaultValue={downloadOptions.size}
            value={downloadOptions.size}
            onValueChange={(value) =>
              updateDownloadOption(
                "size",
                value as
                  | "small"
                  | "medium"
                  | "large"
                  | "xlarge"
                  | "2xl"
                  | "3xl"
                  | "custom",
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
      {downloadOptions.size === "custom" && (
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

      {/* Download and Copy Buttons */}
      <div className="grid grid-cols-6 gap-3 w-full flex-col items-stretch justify-center">
        {/* Download Button */}
        <Button
          variant="outline"
          onClick={handleDownload}
          disabled={isDownloading || !!sizeError}
          className="col-span-4"
        >
          <DownloadIcon className="h-4 w-4" />
          {isDownloading
            ? "Downloading..."
            : `Download ${downloadOptions.format.toUpperCase()}`}
        </Button>

        {/* Copy SVG Button */}
        <Button
          className="col-span-2"
          onClick={handleCopySVG}
          variant="outline"
        >
          <CopyIcon className="h-4 w-4" />
          Copy SVG
        </Button>
      </div>
    </div>
  );
};
