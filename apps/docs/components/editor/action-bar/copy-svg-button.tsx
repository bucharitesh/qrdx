"use client";

import { toast } from "@repo/design-system";
import { Tick as Check } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Copy } from "iconsax-reactjs";
import { getQRData, getSVGString } from "qrdx";
import { useState } from "react";
import { emitSound } from "@/components/editor/sound";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
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
          logo: themeState.styles.customLogo ?? DEFAULT_QR_LOGO,
        }),
        level: themeState.styles.level,
        cornerEyePattern: themeState.styles.cornerEyePattern,
        cornerEyeDotPattern: themeState.styles.cornerEyeDotPattern,
        templateId: themeState.styles.templateId,
        margin: themeState.styles.margin,
        frame: themeState.styles.frame,
      };

      const svgContent = await getSVGString(qrProps);
      await navigator.clipboard.writeText(svgContent);
      setCopied(true);
      emitSound("copy");
      toast.success("SVG copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Error copying SVG:", error);
      toast.error("Failed to copy SVG");
    }
  };

  return (
    <TooltipWrapper label="Copy SVG" kbd="C" asChild>
      <Button variant="ghost" size="sm" onClick={handleCopySVG}>
        {copied ? (
          <>
            <Check className="size-4" />
            <span className="hidden text-sm md:block sr-only">Copied</span>
          </>
        ) : (
          <>
            <Copy className="size-4" />
            <span className="hidden text-sm md:block sr-only">Copy SVG</span>
          </>
        )}
      </Button>
    </TooltipWrapper>
  );
}
