"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { ChevronDownIcon, CopyIcon, DownloadIcon } from "lucide-react";
import { getQRAsCanvas, getQRAsSVGDataUri, getQRData } from "qrdx";
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

  const downloadFile = (dataUrl: string, filename: string) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPNG = async () => {
    try {
      const dataUrl = await getQRAsCanvas(qrProps, "image/png");
      if (typeof dataUrl === "string") {
        downloadFile(dataUrl, "qr-code.png");
      }
    } catch (error) {
      console.error("Error downloading PNG:", error);
    }
  };

  const handleDownloadJPG = async () => {
    try {
      const dataUrl = await getQRAsCanvas(qrProps, "image/jpeg");
      if (typeof dataUrl === "string") {
        downloadFile(dataUrl, "qr-code.jpg");
      }
    } catch (error) {
      console.error("Error downloading JPG:", error);
    }
  };

  const handleDownloadSVG = async () => {
    try {
      const svgDataUri = await getQRAsSVGDataUri(qrProps);
      downloadFile(svgDataUri, "qr-code.svg");
    } catch (error) {
      console.error("Error downloading SVG:", error);
    }
  };

  const handleCopySVG = async () => {
    try {
      const svgDataUri = await getQRAsSVGDataUri(qrProps);
      // Extract SVG content from data URI
      const svgContent = decodeURIComponent(
        svgDataUri.replace("data:image/svg+xml,", ""),
      );

      await navigator.clipboard.writeText(svgContent);
      // You could add a toast notification here if available
      console.log("SVG copied to clipboard");
    } catch (error) {
      console.error("Error copying SVG:", error);
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        {/* Image Download Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="flex w-full items-center justify-center gap-2 sm:w-auto"
              variant="outline"
            >
              <DownloadIcon className="h-4 w-4" />
              Image
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={handleDownloadPNG}>
              Download PNG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadJPG}>
              Download JPG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadSVG}>
              Download SVG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Copy SVG Button */}
        <Button
          className="flex w-full items-center justify-center gap-2 sm:w-auto"
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
