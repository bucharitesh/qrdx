import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Share } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { TooltipWrapper } from "@/components/tooltip-wrapper";

interface ShareButtonProps extends React.ComponentProps<typeof Button> {
  isSharing?: boolean;
  /** Show the label next to the icon (the phone's bottom bar). */
  labelled?: boolean;
}

export function ShareButton({
  onClick,
  isSharing,
  disabled,
  className,
  labelled = false,
  variant = "ghost",
  ...props
}: ShareButtonProps) {
  const t = useTranslations("editor.actionBar.shareButton");
  return (
    <TooltipWrapper label={t("shareDesign")} kbd="X" asChild>
      <Button
        variant={variant}
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
        <span className={cn("text-sm", !labelled && "sr-only")}>
          {t("share")}
        </span>
      </Button>
    </TooltipWrapper>
  );
}
