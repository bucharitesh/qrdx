import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import type { ComponentProps } from "react";

export interface AIPillActionButtonProps
  extends ComponentProps<typeof Button> {}

/** Suggestion chip under the AI prompt box. */
export function PillActionButton({
  className,
  children,
  ...props
}: AIPillActionButtonProps) {
  return (
    <Button
      className={cn(
        "text-muted-foreground hover:text-foreground shrink-0 gap-1.5 font-medium whitespace-nowrap shadow-none select-none active:scale-[0.97] [&>svg]:size-3.5",
        className,
      )}
      size="sm"
      variant="outline"
      {...props}
    >
      {children}
    </Button>
  );
}
