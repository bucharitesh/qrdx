import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Icons } from "@/components/icons";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

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
    <TooltipWrapper label="Save QR theme" kbd="S" asChild>
      <Button
        variant="ghost"
        size="sm"
        className={cn(className)}
        disabled={isSaving || disabled}
        {...props}
      >
        {isSaving ? (
          <Icons.Loader className="size-3.5 animate-spin" />
        ) : (
          <Icons.Heart className="size-3.5" />
        )}
        <span className="hidden text-sm md:block sr-only">Save</span>
      </Button>
    </TooltipWrapper>
  );
}
