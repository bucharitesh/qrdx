import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import {
  StopCircle as CircleStop,
  Magicpen as WandSparkles,
} from "iconsax-reactjs";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

interface EnhancePromptButtonProps extends React.ComponentProps<typeof Button> {
  isEnhancing: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function EnhancePromptButton({
  className,
  disabled,
  isEnhancing,
  onStart,
  onStop,
  ...props
}: EnhancePromptButtonProps) {
  return (
    <TooltipWrapper label={isEnhancing ? "Stop" : "Enhance prompt"} asChild>
      <Button
        size="icon"
        variant={isEnhancing ? "destructive" : "outline"}
        className={cn("relative size-8 shadow-none", className)}
        onClick={isEnhancing ? onStop : onStart}
        disabled={disabled}
        {...props}
      >
        {isEnhancing ? <CircleStop /> : <WandSparkles />}
      </Button>
    </TooltipWrapper>
  );
}
