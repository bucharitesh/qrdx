"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Copy, CopyCheck } from "lucide-react";
import type { ComponentProps } from "react";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-clipboard";
import { TooltipWrapper } from "./tooltip-wrapper";

interface CopyButtonProps extends ComponentProps<typeof Button> {
  textToCopy: string;
  successMessage?: {
    title?: string;
    description?: string;
  };
}

export function CopyButton({
  textToCopy,
  successMessage,
  className,
  ...props
}: CopyButtonProps) {
  const { copyToClipboard, hasCopied } = useCopyToClipboard();

  return (
    <TooltipWrapper label="Copy" asChild>
      <Button
        size="icon"
        variant="ghost"
        className={cn("size-6 [&>svg]:size-3.5", className)}
        onClick={() => copyToClipboard(textToCopy, successMessage)}
        {...props}
      >
        {hasCopied ? <CopyCheck /> : <Copy />}
        <span className="sr-only">Copy</span>
      </Button>
    </TooltipWrapper>
  );
}
