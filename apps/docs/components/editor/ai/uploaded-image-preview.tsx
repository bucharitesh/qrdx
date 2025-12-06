"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Loader2, X } from "lucide-react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

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
  if (isImageLoading) {
    return (
      <div className="bg-muted flex size-14 items-center justify-center rounded-md border">
        <Loader2 className="text-muted-foreground size-4 animate-spin" />
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
            alt="Uploaded preview"
            className="size-full rounded-sm object-cover"
          />

          <TooltipWrapper label="Remove image" asChild>
            <Button
              variant="destructive"
              size="icon"
              className={cn(
                "absolute top-1 right-1 size-4 rounded-full transition-all",
              )}
              onClick={handleImageRemove}
            >
              <X className="size-3!" />
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
              alt="Uploaded preview enlarged"
              className="h-auto max-h-[300px] w-auto max-w-[300px] object-contain"
            />
          </div>
        </HoverCardContent>
      )}
    </HoverCard>
  );
}
