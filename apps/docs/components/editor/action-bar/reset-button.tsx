import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Icons } from "@/components/icons";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

interface ResetButtonProps extends React.ComponentProps<typeof Button> {}

export function ResetButton({ className, ...props }: ResetButtonProps) {
  return (
    <TooltipWrapper label="Reset to preset defaults" kbd="R" asChild>
      <Button variant="ghost" size="sm" className={cn(className)} {...props}>
        <Icons.RefreshCw className="size-3.5" />
        <span className="hidden text-sm md:block sr-only">Reset</span>
      </Button>
    </TooltipWrapper>
  );
}
