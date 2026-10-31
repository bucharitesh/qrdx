"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowUp } from "iconsax-reactjs";
import type { ComponentProps } from "react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { shinePressClass } from "./shine-border";

/**
 * The AI composers' send button: a filled gradient circle with a white arrow
 * when there's something to send, neutral when empty, and a plain "Stop"
 * button with a spinner while a generation runs.
 */
export function AISendButton({
  generating,
  onStop,
  disabled,
  className,
  label = "Generate",
  ...props
}: ComponentProps<typeof Button> & {
  generating?: boolean;
  onStop?: () => void;
  label?: string;
}) {
  if (generating) {
    return (
      <Button
        className="gap-1.5 shadow-none"
        onClick={onStop}
        size="sm"
        type="button"
        variant="outline"
      >
        <Spinner className="size-3.5" />
        Stop
      </Button>
    );
  }

  return (
    <TooltipWrapper asChild label={`${label} (Enter)`}>
      <Button
        aria-label={label}
        className={cn(
          "shadow-none",
          disabled
            ? "bg-muted text-muted-foreground border"
            : cn(
                "border border-white/20 bg-[linear-gradient(135deg,#8b5cf6,#ec4899_55%,#f59e0b)] text-white shadow-[0_6px_16px_-6px_rgba(236,72,153,0.7),inset_0_1px_0_rgba(255,255,255,0.35)] hover:bg-transparent hover:text-white hover:brightness-110 dark:hover:bg-transparent",
                shinePressClass,
              ),
          className,
        )}
        disabled={disabled}
        size="icon-sm"
        type="button"
        variant="ghost"
        {...props}
      >
        <ArrowUp className="size-4" />
      </Button>
    </TooltipWrapper>
  );
}
