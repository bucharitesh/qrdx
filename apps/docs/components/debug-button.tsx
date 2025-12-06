import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Bug } from "lucide-react";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

interface DebugButtonProps extends React.ComponentProps<typeof Button> {
  debug?: boolean;
}

const isDevMode = process.env.NODE_ENV === "development";

export function DebugButton({
  className,
  debug = isDevMode,
  ...props
}: DebugButtonProps) {
  if (!debug) return null;

  return (
    <TooltipWrapper label="Debug" asChild>
      <Button
        variant="ghost"
        size="icon"
        className={cn("", className)}
        {...props}
      >
        <Bug />
      </Button>
    </TooltipWrapper>
  );
}
