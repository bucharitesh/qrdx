import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Share } from "iconsax-reactjs";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

interface ShareButtonProps extends React.ComponentProps<typeof Button> {
  isSharing?: boolean;
}

export function ShareButton({
  onClick,
  isSharing,
  disabled,
  className,
  ...props
}: ShareButtonProps) {
  return (
    <TooltipWrapper label="Share design" kbd="X" asChild>
      <Button
        variant="ghost"
        size="sm"
        className={cn(className)}
        onClick={onClick}
        disabled={isSharing || disabled}
        {...props}
      >
        {isSharing ? (
          <Spinner className="size-4" />
        ) : (
          <Share className="size-4" />
        )}
        <span className="hidden text-sm md:block sr-only">Share</span>
      </Button>
    </TooltipWrapper>
  );
}
