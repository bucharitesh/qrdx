"use client";

import { Close, Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@repo/design-system/components/ui/hover-card";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "next-intl";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

interface ImagePreviewProps {
  src: string;
  isImageLoading?: boolean;
  handleImageRemove: () => void;
  showPreviewOnHover?: boolean;
}

export function UploadedImagePreview({
  src,
  isImageLoading = false,
  handleImageRemove,
  showPreviewOnHover = true,
}: ImagePreviewProps) {
  const t = useTranslations("editor.ai.uploadedImagePreview");
  if (isImageLoading) {
    return (
      <div className="bg-muted flex size-14 items-center justify-center rounded-md border">
        <Spinner className="text-muted-foreground size-4 animate-spin" />
      </div>
    );
  }

  return (
    <HoverCard openDelay={150} closeDelay={150}>
      <HoverCardTrigger asChild>
        <div
          className={cn(
            "group/preview animate-in fade-in-0 relative size-14 shrink-0 rounded-md border p-0.5 transition-all",
            "hover:bg-accent",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={t("uploadedPreview")}
            className="size-full rounded-sm object-cover"
          />

          <TooltipWrapper label={t("removeImage")} asChild>
            <Button
              variant="destructive"
              size="icon"
              aria-label={t("removeImage")}
              className={cn(
                "absolute top-1 right-1 size-4 rounded-full transition-all",
              )}
              onClick={handleImageRemove}
            >
              <Close className="size-3!" />
            </Button>
          </TooltipWrapper>
        </div>
      </HoverCardTrigger>

      {showPreviewOnHover && (
        <HoverCardContent
          className="size-fit overflow-hidden p-0"
          align="center"
          side="top"
        >
          <div className="size-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={t("uploadedPreviewEnlarged")}
              className="h-auto max-h-[300px] w-auto max-w-[300px] object-contain"
            />
          </div>
        </HoverCardContent>
      )}
    </HoverCard>
  );
}
