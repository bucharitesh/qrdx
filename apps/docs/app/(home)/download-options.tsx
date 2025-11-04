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
  type DownloadFormat,
  type DownloadSize,
  downloadQRCode,
  getQRData,
  getSVGString,
  PRESET_SIZES,
  validateSize,
} from "qrdx";
import type {
  BodyPattern,
  CornerEyeDotPattern,
  CornerEyePattern,
} from "qrdx/types";
import React from "react";

type DownloadOptionsProps = {
  url: string;
  fgColor: string;
  bgColor: string;
  eyeColor: string;
  dotColor: string;
  bodyPattern?: BodyPattern;
  cornerEyePattern?: CornerEyePattern;
  cornerEyeDotPattern?: CornerEyeDotPattern;
  errorLevel?: "L" | "M" | "Q" | "H";
  showLogo: boolean;
  logo?: string;
  templateId?: string;
  customText?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: number;
  fontLetterSpacing?: number;
};

export const DownloadOptions: React.FC<DownloadOptionsProps> = ({
  url,
  fgColor,
  bgColor,
  eyeColor,
  dotColor,
  bodyPattern,
  cornerEyePattern,
  cornerEyeDotPattern,
  errorLevel,
  showLogo,
  logo,
  templateId,
  customText,
  textColor,
  fontSize,
  fontWeight,
  fontLetterSpacing,
}) => {
  const [selectedSize, setSelectedSize] = React.useState<string>("medium");
  const [customWidth, setCustomWidth] = React.useState<string>("600");
  const [customHeight, setCustomHeight] = React.useState<string>("600");
  const [selectedFormat, setSelectedFormat] =
    React.useState<DownloadFormat>("png");
  const [sizeError, setSizeError] = React.useState<string>("");
  const [isDownloading, setIsDownloading] = React.useState(false);

  const qrProps = React.useMemo(
    () => ({
      ...getQRData({
        url,
        fgColor,
        bgColor,
        eyeColor,
        dotColor,
        bodyPattern,
        hideLogo: !showLogo,
        logo,
      }),
      level: errorLevel || "L",
      cornerEyePattern,
      cornerEyeDotPattern,
      templateId,
      customText,
      textColor,
      fontSize,
      fontWeight,
      fontLetterSpacing,
    }),
    [
      url,
      fgColor,
      bgColor,
      showLogo,
      logo,
      templateId,
      eyeColor,
      dotColor,
      bodyPattern,
      cornerEyePattern,
      cornerEyeDotPattern,
      errorLevel,
      customText,
      textColor,
      fontSize,
      fontWeight,
      fontLetterSpacing,
    ],
  );

  // Get the current size based on selection
  const getCurrentSize = (): DownloadSize => {
    if (selectedSize === "custom") {
      return {
        width: Number.parseInt(customWidth, 10) || 600,
        height: Number.parseInt(customHeight, 10) || 600,
      };
    }
    return PRESET_SIZES[selectedSize] || PRESET_SIZES.medium;
  };

  // Validate custom size when it changes
  React.useEffect(() => {
    if (selectedSize === "custom") {
      const width = Number.parseInt(customWidth, 10);
      const height = Number.parseInt(customHeight, 10);

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
  }, [selectedSize, customWidth, customHeight]);

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
        format: selectedFormat,
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
          <Select value={selectedSize} onValueChange={setSelectedSize}>
            <SelectTrigger id="size-select" className="w-full">
              <SelectValue placeholder="Select size" />
            </SelectTrigger>
            <SelectContent className="w-full">
              <SelectItem value="small">200 × 200</SelectItem>
              <SelectItem value="medium">400 × 400</SelectItem>
              <SelectItem value="large">800 × 800</SelectItem>
              <SelectItem value="xlarge">1200 × 1200</SelectItem>
              <SelectItem value="custom">Custom Size</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Format Selection */}
        <div className="space-y-2">
          <Label htmlFor="format-select">Format</Label>
          <Select
            value={selectedFormat}
            onValueChange={(value) =>
              setSelectedFormat(value as DownloadFormat)
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
      {selectedSize === "custom" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="custom-width">Width (px)</Label>
            <Input
              id="custom-width"
              type="number"
              min="50"
              max="5000"
              value={customWidth}
              onChange={(e) => setCustomWidth(e.target.value)}
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
              value={customHeight}
              onChange={(e) => setCustomHeight(e.target.value)}
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
            : `Download ${selectedFormat.toUpperCase()}`}
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
