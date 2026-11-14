"use client";

import { track } from "@repo/analytics";
import { toast } from "@repo/design-system";
import { Tick as Check } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Copy } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { getQRData, getSVGString } from "qrdx";
import { useState } from "react";
import { emitSound } from "@/components/editor/sound";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { DEFAULT_QR_LOGO } from "@/lib/constants";
import { styleEngineOptions } from "@/lib/qr-design/engine-options";
import { useQREditorStore } from "@/store/editor-store";

export function CopySVGButton() {
  const t = useTranslations("editor.actionBar.copySvgButton");
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
          level: themeState.styles.level,
          margin: themeState.styles.margin,
          ...styleEngineOptions(themeState.styles),
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
      track("qr_copied", { format: "svg", source: "playground" });
      toast.success(t("svgCopiedToClipboard"));
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Error copying SVG:", error);
      toast.error(t("failedToCopySvg"));
    }
  };

  return (
    <TooltipWrapper label={t("copySvg")} kbd="C" asChild>
      <Button
        disabled={!value.trim()}
        onClick={handleCopySVG}
        size="sm"
        variant="ghost"
      >
        {copied ? (
          <>
            <Check className="size-4" />
            <span className="hidden text-sm md:block sr-only">
              {t("copied")}
            </span>
          </>
        ) : (
          <>
            <Copy className="size-4" />
            <span className="hidden text-sm md:block sr-only">
              {t("copySvg")}
            </span>
          </>
        )}
      </Button>
    </TooltipWrapper>
  );
}
