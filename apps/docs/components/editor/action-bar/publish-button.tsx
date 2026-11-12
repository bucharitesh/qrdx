"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Global as Globe } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PublishThemeDialog } from "@/components/community/publish-theme-dialog";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import type { ThemeStyles } from "@/types/theme";

interface PublishButtonProps {
  themeId: string;
  isPublished: boolean;
  /** The saved theme's style (says what isn't shared) */
  themeStyle?: ThemeStyles;
  themeName?: string;
  disabled?: boolean;
  className?: string;
}

export function PublishButton({
  themeId,
  isPublished,
  themeStyle,
  themeName,
  disabled,
  className,
}: PublishButtonProps) {
  const t = useTranslations("editor.actionBar.publishButton");
  const [showDialog, setShowDialog] = useState(false);

  if (isPublished) {
    return (
      <TooltipWrapper label={t("publishedToCommunity")} asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("text-muted-foreground", className)}
          disabled
        >
          <Globe className="size-4" />
          <span className="hidden text-sm md:block">{t("published")}</span>
        </Button>
      </TooltipWrapper>
    );
  }

  return (
    <>
      <TooltipWrapper label={t("publishToCommunity")} asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(className)}
          disabled={disabled}
          onClick={() => setShowDialog(true)}
        >
          <Globe className="size-4" />
          <span className="hidden text-sm md:block">{t("publish")}</span>
        </Button>
      </TooltipWrapper>

      <PublishThemeDialog
        onOpenChange={setShowDialog}
        open={showDialog}
        themeId={themeId}
        themeName={themeName}
        themeStyle={themeStyle}
      />
    </>
  );
}
