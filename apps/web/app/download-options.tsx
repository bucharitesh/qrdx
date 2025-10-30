"use client";

import { getQRAsCanvas, getQRAsSVGDataUri, getQRData } from "@repo/qr";
import { ChevronDownIcon, CopyIcon, DownloadIcon } from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type DownloadOptionsProps = {
  url: string;
  fgColor: string;
  bgColor: string;
  eyeColor: string;
  dotColor: string;
  showLogo: boolean;
  logo?: string;
  templateId?: string;
};

export const DownloadOptions: React.FC<DownloadOptionsProps> = ({
  url,
  fgColor,
  bgColor,
  eyeColor,
  dotColor,
  showLogo,
  logo,
  templateId,
}) => {
  const qrProps = React.useMemo(
    () => ({
      ...getQRData({
        url,
        fgColor,
        bgColor,
        eyeColor,
        dotColor,
        hideLogo: !showLogo,
        logo,
      }),
      templateId,
    }),
    [url, fgColor, bgColor, showLogo, logo, templateId, eyeColor, dotColor]
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
        svgDataUri.replace("data:image/svg+xml,", "")
      );

      await navigator.clipboard.writeText(svgContent);
      // You could add a toast notification here if available
      console.log("SVG copied to clipboard");
    } catch (error) {
      console.error("Error copying SVG:", error);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {/* Image Download Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="flex items-center gap-2" variant="outline">
              <DownloadIcon className="h-4 w-4" />
              Image
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
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
          className="flex items-center gap-2"
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
