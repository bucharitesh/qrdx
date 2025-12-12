import { TooltipWrapper } from "@/components/tooltip-wrapper";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Heart, Loader2 } from "lucide-react";

interface SaveButtonProps extends React.ComponentProps<typeof Button> {
  isSaving: boolean;
}

export function SaveButton({
  isSaving,
  disabled,
  className,
  ...props
}: SaveButtonProps) {
  return (
    <TooltipWrapper label="Save QR theme" asChild>
      <Button
        variant="ghost"
        size="sm"
        className={cn(className)}
        disabled={isSaving || disabled}
        {...props}
      >
        {isSaving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Heart className="size-3.5" />
        )}
        <span className="hidden text-sm md:block">Save</span>
      </Button>
    </TooltipWrapper>
  );
}








