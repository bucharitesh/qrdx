"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Sparkles, StopCircle } from "lucide-react";
import type { ComponentProps } from "react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

interface EnhancePromptButtonProps extends ComponentProps<typeof Button> {
  isEnhancing: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function EnhancePromptButton({
  isEnhancing,
  onStart,
  onStop,
  disabled,
  className,
  ...props
}: EnhancePromptButtonProps) {
  if (isEnhancing) {
    return (
      <TooltipWrapper label="Stop enhancing" asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={onStop}
          className={cn(
            "flex items-center gap-1.5 shadow-none",
            "@max-[350px]/form:w-8",
            className,
          )}
          {...props}
        >
          <StopCircle className="size-4" />
          <span className="hidden @[350px]/form:inline-flex">Stop</span>
        </Button>
      </TooltipWrapper>
    );
  }

  return (
    <TooltipWrapper label="Enhance prompt with AI" asChild>
      <Button
        variant="outline"
        size="sm"
        onClick={onStart}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 shadow-none",
          "@max-[350px]/form:w-8",
          className,
        )}
        {...props}
      >
        <Sparkles className="size-4" />
        <span className="hidden @[350px]/form:inline-flex">Enhance</span>
      </Button>
    </TooltipWrapper>
  );
}



