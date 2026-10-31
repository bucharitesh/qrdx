import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Heart } from "iconsax-reactjs";
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
    <TooltipWrapper label="Save design" kbd="S" asChild>
      <Button
        variant="ghost"
        size="sm"
        className={cn(className)}
        disabled={isSaving || disabled}
        {...props}
      >
        {isSaving ? (
          <Spinner className="size-4" />
        ) : (
          <Heart className="size-4" />
        )}
        <span className="hidden text-sm md:block sr-only">Save</span>
      </Button>
    </TooltipWrapper>
  );
}
