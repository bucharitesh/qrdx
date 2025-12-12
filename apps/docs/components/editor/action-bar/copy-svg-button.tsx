"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Check, Copy } from "lucide-react";
import { getQRData, getSVGString } from "qrdx";
import { useState } from "react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useQREditorStore } from "@/store/editor-store";

export function CopySVGButton() {
  const { themeState, value } = useQREditorStore();
  const [copied, setCopied] = useState(false);

  const handleCopySVG = async () => {
    try {
      const qrProps = {
        ...getQRData({
          value,
          fgColor: themeState.styles.fgColor,
          bgColor: themeState.styles.bgColor,
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
      };

      const svgContent = await getSVGString(qrProps);
      await navigator.clipboard.writeText(svgContent);
      setCopied(true);
      toast.success("SVG copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Error copying SVG:", error);
      toast.error("Failed to copy SVG");
    }
  };

  return (
    <TooltipWrapper label="Copy SVG" asChild>
      <Button variant="ghost" size="sm" onClick={handleCopySVG}>
        {copied ? (
          <>
            <Check className="h-4 w-4" />
            <span className="hidden text-sm md:block">Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            <span className="hidden text-sm md:block">Copy SVG</span>
          </>
        )}
      </Button>
    </TooltipWrapper>
  );
}





