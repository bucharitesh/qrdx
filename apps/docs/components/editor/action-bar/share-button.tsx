import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Icons } from "@/components/icons";
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
    <TooltipWrapper label="Share QR code" kbd="X" asChild>
      <Button
        variant="ghost"
        size="sm"
        className={cn(className)}
        onClick={onClick}
        disabled={isSharing || disabled}
        {...props}
      >
        {isSharing ? (
          <Icons.Loader className="size-3.5 animate-spin" />
        ) : (
          <Icons.Share2 className="size-3.5" />
        )}
        <span className="hidden text-sm md:block sr-only">Share</span>
      </Button>
    </TooltipWrapper>
  );
}
