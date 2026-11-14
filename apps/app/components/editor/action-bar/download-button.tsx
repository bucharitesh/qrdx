"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Import } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { useQREditorStore } from "@/store/editor-store";
import { useDownloadDialogStore } from "./download-dialog-store";

interface DownloadButtonProps {
  className?: string;
  size?: "sm" | "default";
  /** Off on touch screens (the phone's bottom bar), where hover never fires. */
  tooltip?: boolean;
}

/**
 * The editor's primary action, always labelled. Until there is content the
 * preview shows a sample, so there is nothing of the user's to download yet.
 */
export function DownloadButton({
  className,
  size = "sm",
  tooltip = true,
}: DownloadButtonProps) {
  const t = useTranslations("editor.actionBar.downloadButton");
  const hasContent = useQREditorStore((state) => state.value.trim() !== "");
  const setOpen = useDownloadDialogStore((state) => state.setOpen);

  const button = (
    <Button
      className={cn("gap-1.5", className)}
      disabled={!hasContent}
      onClick={() => setOpen(true)}
      size={size}
    >
      <Import className="size-4" />
      {t("download")}
    </Button>
  );

  if (!(hasContent && tooltip)) return button;
  return (
    <TooltipWrapper label={t("downloadQrCode")} kbd="D" asChild>
      {button}
    </TooltipWrapper>
  );
}
