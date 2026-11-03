"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Global as Globe } from "iconsax-reactjs";
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
  const [showDialog, setShowDialog] = useState(false);

  if (isPublished) {
    return (
      <TooltipWrapper label="Published to community" asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("text-muted-foreground", className)}
          disabled
        >
          <Globe className="size-4" />
          <span className="hidden text-sm md:block">Published</span>
        </Button>
      </TooltipWrapper>
    );
  }

  return (
    <>
      <TooltipWrapper label="Publish to community" asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(className)}
          disabled={disabled}
          onClick={() => setShowDialog(true)}
        >
          <Globe className="size-4" />
          <span className="hidden text-sm md:block">Publish</span>
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
